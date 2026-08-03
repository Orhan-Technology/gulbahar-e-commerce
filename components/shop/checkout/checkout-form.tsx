'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote, Clock, MapPin, Plus, Smartphone, Store } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FreeDeliveryBar } from '@/components/shop/cart/free-delivery-bar';
import { HesabPaySheet } from '@/components/shop/checkout/hesabpay-sheet';
import { saveAddress } from '@/lib/actions/account';
import { placeOrder, type StockShortage } from '@/lib/actions/checkout';
import { pickLocale } from '@/lib/db/localized';
import {
  formatCurrency,
  formatList,
  formatNumber,
  formatPhone,
  formatUnitNumber,
} from '@/lib/format';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type CheckoutAddress = {
  id: string;
  label: string;
  district: string;
  streetDetails: string;
  phone: string;
};

export type CheckoutPickupShop = {
  shopId: string;
  name: string;
  floor: number | null;
  unitNumber: string | null;
};

export type CheckoutFormProps = {
  addresses: CheckoutAddress[];
  /**
   * Which saved address opens selected (finding #14).
   *
   * Derived on the server from the customer's most recent delivered-to address
   * — see lib/db/queries/account.ts. Null when there is no evidence, and the
   * form falls back to the first saved row exactly as before.
   */
  defaultAddressId: string | null;
  districts: string[];
  pickupShops: CheckoutPickupShop[];
  /** How long a shop holds a reserve-and-collect order (Prompt C11). */
  holdHours: number;
  /** Cart total before any delivery fee. */
  cartTotal: number;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  /** How many shops the basket spans — how many parcels this becomes. */
  shopCount: number;
  /** The basket itself, rendered on the server (components/shop/checkout/checkout-items.tsx). */
  itemsSummary: React.ReactNode;
};

/**
 * Checkout (PRD §5.3).
 *
 * One screen rather than a wizard: at three decisions (fulfilment, address,
 * payment) a multi-step flow adds clicks without reducing load, and the demo has
 * four minutes for the whole storefront journey.
 *
 * HesabPay opens the simulated sheet BEFORE the order is written, so the sequence
 * the client sees matches a real payment: authorise, then the order exists. COD
 * places immediately.
 */
export function CheckoutForm({
  addresses,
  defaultAddressId,
  districts,
  pickupShops,
  holdHours,
  cartTotal,
  deliveryFee,
  freeDeliveryThreshold,
  shopCount,
  itemsSummary,
}: CheckoutFormProps) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const router = useRouter();

  const [fulfillment, setFulfillment] = React.useState<'delivery' | 'pickup'>('delivery');
  const [paymentMethod, setPaymentMethod] = React.useState<'cod' | 'hesabpay'>('cod');
  const [addressId, setAddressId] = React.useState(
    defaultAddressId ?? addresses[0]?.id ?? '',
  );
  const [showNewAddress, setShowNewAddress] = React.useState(addresses.length === 0);
  const [payOpen, setPayOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  /** Lines the shop could not cover, shown in place of a bare error toast. */
  const [shortages, setShortages] = React.useState<StockShortage[]>([]);

  /*
   * ONE KEY FOR THIS CHECKOUT, minted on first submit and kept afterwards.
   *
   * In a ref rather than in state, and set inside the handler rather than
   * during render: crypto.randomUUID() is impure and React 19's lint rules
   * forbid calling it while rendering (CLAUDE.md). A ref also means a retry
   * after a failure carries the SAME key, which is the entire point — a
   * double-tapped button or a retry after a network timeout on a request that
   * actually committed comes back with the original order instead of writing a
   * second one.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  const effectiveFee =
    fulfillment === 'delivery' && cartTotal < freeDeliveryThreshold ? deliveryFee : 0;
  const grandTotal = cartTotal + effectiveFee;
  const freeDeliveryGap = freeDeliveryThreshold - cartTotal;

  /*
   * WHERE THIS ORDER IS GOING, in one sentence, for the recap beside the button.
   *
   * Null when a delivery order has no address chosen yet — the recap then says
   * nothing about a destination rather than inventing one, and `onPlaceOrder`
   * is the control that refuses.
   */
  const selectedAddress = addresses.find((address) => address.id === addressId) ?? null;
  const destination =
    fulfillment === 'delivery'
      ? selectedAddress
        ? t('recapDelivery', {
            address: `${selectedAddress.label} — ${selectedAddress.district}، ${selectedAddress.streetDetails}`,
          })
        : null
      : // `n` pluralises, `count` renders with locale digits — the same pair the
        // account hub's section counts use.
        t('recapPickup', {
          n: pickupShops.length,
          count: formatNumber(pickupShops.length, locale),
        });

  function submitOrder() {
    idempotencyKey.current ??= crypto.randomUUID();

    startTransition(async () => {
      const result = await placeOrder({
        fulfillment,
        paymentMethod,
        addressId: fulfillment === 'delivery' ? addressId : undefined,
        idempotencyKey: idempotencyKey.current!,
      });

      if (!result.ok) {
        /*
         * A SOLD-OUT LINE IS NOT A TOAST. It names specific products and the
         * customer has to change the basket to get past it, so it stays on
         * screen with the numbers in it rather than disappearing after four
         * seconds.
         */
        if (result.error === 'insufficient_stock') {
          setShortages(result.shortages);
          toast.error(t('errors.insufficient_stock'));
          // The cart page holds the steppers that fix it, and its stock figures
          // are now stale.
          router.refresh();
          return;
        }
        /*
         * Same reasoning as the sold-out branch: the customer cannot get past
         * this without changing the basket, and the message has to name WHICH
         * shop stopped taking orders — a basket can hold several.
         */
        if (result.error === 'shop_paused') {
          toast.error(
            t('errors.shop_paused', { shops: formatList(result.pausedShops, locale) }),
          );
          router.refresh();
          return;
        }
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      setShortages([]);

      // Confirmation lives on its own URL, so it survives a refresh and can be
      // reopened from the order list.
      router.push(`/checkout/confirmation/${result.reference}`);
    });
  }

  function onPlaceOrder() {
    if (fulfillment === 'delivery' && !addressId) {
      toast.error(t('errors.address_required'));
      return;
    }

    if (paymentMethod === 'hesabpay') {
      setPayOpen(true);
      return;
    }
    submitOrder();
  }

  async function onSaveAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    const result = await saveAddress({
      label: String(data.get('label') ?? ''),
      district: String(data.get('district') ?? ''),
      streetDetails: String(data.get('streetDetails') ?? ''),
      phone: String(data.get('phone') ?? ''),
    });

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }

    toast.success(t('addressSaved'));
    setShowNewAddress(false);
    router.refresh();
  }

  return (
    <>
      {/*
        A DIV, not a form — and deliberately.

        The address block below is a real <form> with required fields, and a <form>
        cannot legally contain another. Browsers drop the inner one, which broke
        hydration. Of the two, the address block is the one that needs to be a form:
        it has native validation and wants Enter to submit. This outer wrapper had no
        inputs of its own — only controlled radio groups and the button — so it lost
        nothing by becoming a div.

        Pressing Enter in an address field now saves the address instead of placing
        the order, which is also the safer of the two behaviours.
      */}
      <div className="space-y-6">
        {/* Fulfilment */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          <h2 className="text-sm font-bold">{t('fulfillmentHeading')}</h2>

          <RadioGroup
            value={fulfillment}
            onValueChange={(value) => setFulfillment(value as 'delivery' | 'pickup')}
            className="grid gap-2 sm:grid-cols-2"
          >
            {(['delivery', 'pickup'] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  'rounded-control flex cursor-pointer items-start gap-3 border p-3 transition-colors duration-150',
                  fulfillment === option ? 'border-primary bg-primary-50' : 'border-input bg-card',
                )}
              >
                <RadioGroupItem value={option} id={`fulfillment-${option}`} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {option === 'delivery' ? (
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <Store className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {t(option)}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {t(`${option}Hint`)}
                  </span>
                  {/*
                    WHEN IT ARRIVES, on the control where the choice is made.
                    "۱ تا ۲ روز کاری" existed only in the footer's marketing
                    strip — three screens away from the one decision it informs
                    — so the customer picking between a courier and a walk up
                    two flights of stairs had no idea what they were trading.
                  */}
                  <span className="text-primary-700 mt-1 flex items-center gap-1 text-xs font-medium">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    {t(option === 'delivery' ? 'deliveryEta' : 'pickupEta')}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </section>

        {/* Delivery address, or pickup locations */}
        {fulfillment === 'delivery' ? (
          <section className="rounded-card border-border bg-card space-y-3 border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">{t('addressHeading')}</h2>
              {addresses.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewAddress((current) => !current)}
                >
                  <Plus />
                  {t('addAddress')}
                </Button>
              )}
            </div>

            {addresses.length > 0 && (
              <RadioGroup value={addressId} onValueChange={setAddressId} className="space-y-2">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={cn(
                      'rounded-control flex cursor-pointer items-start gap-3 border p-3 transition-colors duration-150',
                      addressId === address.id
                        ? 'border-primary bg-primary-50'
                        : 'border-input bg-card',
                    )}
                  >
                    <RadioGroupItem value={address.id} className="mt-0.5" />
                    <span className="min-w-0 text-sm">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{address.label}</span>
                        {/* SAYS WHY IT IS PRESELECTED. A radio that arrives
                            already chosen with no explanation is a decision
                            somebody else made; naming it as the last place they
                            had something delivered makes it checkable. */}
                        {address.id === defaultAddressId && (
                          <span className="rounded-pill bg-primary-50 text-primary-700 text-2xs px-2 py-0.5 font-medium">
                            {t('defaultAddress')}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {address.district} — {address.streetDetails}
                      </span>
                      <span className="text-muted-foreground block text-xs" dir="ltr">
                        {formatPhone(address.phone, locale)}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}

            {showNewAddress && (
              <form
                onSubmit={onSaveAddress}
                className="rounded-control space-y-3 bg-neutral-50 p-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="label">{t('addressLabel')}</Label>
                    <Input id="label" name="label" required placeholder={t('addressLabelHint')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="district">{t('district')}</Label>
                    <Select name="district" required>
                      <SelectTrigger id="district">
                        <SelectValue placeholder={t('districtHint')} />
                      </SelectTrigger>
                      <SelectContent>
                        {districts.map((district) => (
                          <SelectItem key={district} value={district}>
                            {district}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="streetDetails">{t('streetDetails')}</Label>
                  <Input
                    id="streetDetails"
                    name="streetDetails"
                    required
                    placeholder={t('streetDetailsHint')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="addrPhone">{t('phone')}</Label>
                  {/* `tel` + numeric keypad: this is the field a courier will
                      ring, and it was opening the full QWERTY keyboard on a
                      phone — ten digits typed through a letter keyboard, on the
                      screen where a typo means an undeliverable parcel. The
                      sign-in form has always got this right; these two had not. */}
                  <Input
                    id="addrPhone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    required
                    dir="ltr"
                    placeholder="0700000000"
                  />
                </div>

                <Button type="submit" size="sm">
                  {t('saveAddress')}
                </Button>
              </form>
            )}
          </section>
        ) : (
          <section className="rounded-card border-border bg-card space-y-2 border p-4">
            <h2 className="text-sm font-bold">{t('pickupHeading')}</h2>
            <p className="text-muted-foreground text-xs">{t('pickupBody')}</p>
            {/*
              The PROMISE, stated before they choose (Prompt C11): the shop
              takes the goods off the shelf and holds them for a stated number
              of hours, and a code arrives when it is ready. Someone deciding
              between delivery and a trip up two flights of stairs needs to know
              both halves of that, not discover the second on the confirmation
              screen.
            */}
            <p className="rounded-control border-primary-200 bg-primary-50 text-primary-900 border p-2.5 text-xs leading-relaxed">
              {t('pickupHold', { hours: formatNumber(holdHours, locale) })}
            </p>
            <ul className="space-y-1.5 pt-1">
              {pickupShops.map((shop) => (
                <li key={shop.shopId} className="flex items-center gap-2 text-sm">
                  <Store className="text-primary-700 h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate font-medium">{shop.name}</span>
                  {shop.floor !== null && (
                    <span className="text-muted-foreground ms-auto shrink-0 text-xs">
                      {t('floorUnit', {
                        floor: formatNumber(shop.floor, locale),
                        unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Payment */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          <h2 className="text-sm font-bold">{t('paymentHeading')}</h2>

          <RadioGroup
            value={paymentMethod}
            onValueChange={(value) => setPaymentMethod(value as 'cod' | 'hesabpay')}
            className="grid gap-2 sm:grid-cols-2"
          >
            {(['cod', 'hesabpay'] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  'rounded-control flex cursor-pointer items-start gap-3 border p-3 transition-colors duration-150',
                  paymentMethod === option
                    ? 'border-primary bg-primary-50'
                    : 'border-input bg-card',
                )}
              >
                <RadioGroupItem value={option} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {option === 'cod' ? (
                      <Banknote className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {t(option)}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {t(`${option}Hint`)}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </section>

        {/* What is being bought, immediately above what it costs */}
        {itemsSummary}

        {/* Totals + submit */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          {/*
            THE LINES THAT CANNOT BE FILLED, in place. Named, with the number
            still available, because "out of stock" without saying which item
            leaves the customer to guess across a basket of six.
          */}
          {shortages.length > 0 && (
            <div className="rounded-control border-danger-border bg-danger-bg space-y-1.5 border p-3">
              <p className="text-danger text-xs font-semibold">{t('errors.insufficient_stock')}</p>
              <ul className="space-y-1">
                {shortages.map((shortage) => (
                  <li key={shortage.productId} className="text-danger flex flex-wrap gap-x-2 text-xs">
                    <span className="font-medium">{pickLocale(shortage.title, locale)}</span>
                    <span className="tabular-nums">
                      {shortage.available > 0
                        ? t('onlyLeft', { count: formatNumber(shortage.available, locale) })
                        : t('soldOut')}
                    </span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" size="sm">
                <Link href="/cart">{t('editCart')}</Link>
              </Button>
            </div>
          )}

          {/* Free delivery, as distance rather than as a sentence (PRD §8.1) */}
          {fulfillment === 'delivery' && (
            <FreeDeliveryBar
              percent={(cartTotal / Math.max(1, freeDeliveryThreshold)) * 100}
              reached={freeDeliveryGap <= 0}
              message={
                freeDeliveryGap > 0
                  ? t('freeDeliveryGap', {
                      amount: formatCurrency(freeDeliveryGap, locale),
                      fee: formatCurrency(deliveryFee, locale),
                    })
                  : t('freeDeliveryReached')
              }
            />
          )}

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('itemsTotal')}</dt>
              <dd className="tabular-nums">{formatCurrency(cartTotal, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('deliveryFee')}</dt>
              <dd className="tabular-nums">
                {effectiveFee === 0 ? t('free') : formatCurrency(effectiveFee, locale)}
              </dd>
            </div>
            <div className="border-border flex justify-between border-t pt-2 text-base font-bold">
              <dt>{t('grandTotal')}</dt>
              <dd className="tabular-nums">{formatCurrency(grandTotal, locale)}</dd>
            </div>
          </dl>

          {/*
            Said once more beside the button, in the fulfilment's own words: two
            shops means two deliveries or two counters, and this is the last
            moment it can be a decision rather than a surprise.
          */}
          {shopCount > 1 && (
            <p className="text-muted-foreground text-xs">
              {t(fulfillment === 'delivery' ? 'multiShopDelivery' : 'multiShopPickup', {
                count: formatNumber(shopCount, locale),
              })}
            </p>
          )}

          {/*
            THE RECAP, immediately above the press (finding #6).

            This is the highest-anxiety button in the product, and until now the
            two facts it commits to — where it goes and how it gets paid for —
            were two screens further up and never restated. Scrolling back to
            check means leaving the button, which is exactly when baskets get
            abandoned.

            Two ROWS rather than one «تحویل به: … · پرداخت …» line, and not only
            for width: a middle dot immediately before a Persian numeral renders
            as «۰» in Vazirmatn, and an address ending in a house number would
            have picked up a leading zero from the separator.
          */}
          <Recap
            className="rounded-control border-border space-y-1.5 border bg-neutral-50 p-3 text-xs"
            fulfillment={fulfillment}
            destination={destination}
            method={paymentMethod}
            // The radio's own label repeats the word «پرداخت» — «پرداخت:
            // پرداخت در وقت تحویل» — so the recap has its own shorter noun for
            // each method.
            payment={t('recapPayment', { method: t(`recapMethod.${paymentMethod}` as never) })}
          />

          {/* Below `lg` the sticky bar at the foot of the screen owns this
              press, so the same button is never on screen twice. */}
          <Button
            type="button"
            onClick={onPlaceOrder}
            size="lg"
            className="w-full max-lg:hidden"
            disabled={pending}
          >
            {pending
              ? t('placing')
              : paymentMethod === 'hesabpay'
                ? t('payAndPlace')
                : t('placeOrder')}
          </Button>
        </section>

        {/*
          THE STICKY PRIMARY ACTION on phones and tablets (finding #5).

          Checkout is one long column — fulfilment, address, payment, the whole
          basket, then the totals — so «ثبت سفارش» sat past the fold on every
          order and a long way past it on a multi-shop one. The bar carries the
          payable total and the same recap the inline button gets, condensed:
          a commit button that does not say what it commits to is the wrong half
          of the decision, and that is more true when it floats.

          `sticky`, not `fixed` — StretchScroll's overscroll transform becomes
          the containing block for a fixed descendant and throws it out of the
          viewport for the length of the gesture (see the product page's bar).
          `bottom-16` clears the mobile tab bar; from `md` there is none.

          It carries no transition, so `prefers-reduced-motion` has nothing to
          gate here and the behaviour is identical for every reader — the rule
          is that reduced motion removes the ANIMATION, never the feature.
        */}
        <div className="border-border bg-background/95 sticky bottom-16 z-30 -mx-4 space-y-2 border-t p-3 backdrop-blur-md sm:-mx-7 md:bottom-0 lg:hidden">
          <Recap
            className="text-2xs space-y-0.5"
            fulfillment={fulfillment}
            destination={destination}
            method={paymentMethod}
            // The radio's own label repeats the word «پرداخت» — «پرداخت:
            // پرداخت در وقت تحویل» — so the recap has its own shorter noun for
            // each method.
            payment={t('recapPayment', { method: t(`recapMethod.${paymentMethod}` as never) })}
          />
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-2xs">{t('grandTotal')}</p>
              <p className="text-base font-bold tabular-nums">
                {formatCurrency(grandTotal, locale)}
              </p>
            </div>
            <Button
              type="button"
              onClick={onPlaceOrder}
              size="lg"
              className="ms-auto shrink-0"
              disabled={pending}
            >
              {pending
                ? t('placing')
                : paymentMethod === 'hesabpay'
                  ? t('payAndPlace')
                  : t('placeOrder')}
            </Button>
          </div>
        </div>
      </div>

      <HesabPaySheet
        open={payOpen}
        amount={grandTotal}
        onOpenChange={setPayOpen}
        onApproved={() => {
          setPayOpen(false);
          submitOrder();
        }}
      />
    </>
  );
}

/**
 * The two commitments restated next to the button that makes them (finding #6).
 *
 * Rendered twice — inline above the desktop button and inside the mobile sticky
 * bar — from one component, so the sentence a customer reads before pressing
 * cannot differ between viewports. Each fact is its own ROW with its own icon:
 * a single line joined by a separator would put a punctuation mark against a
 * Persian numeral, which Vazirmatn renders as a leading zero.
 */
function Recap({
  className,
  fulfillment,
  destination,
  method,
  payment,
}: {
  className?: string;
  fulfillment: 'delivery' | 'pickup';
  /** Null while a delivery order still has no address chosen. */
  destination: string | null;
  method: 'cod' | 'hesabpay';
  payment: string;
}) {
  return (
    <div className={cn('text-muted-foreground', className)}>
      {destination && (
        <p className="flex items-start gap-1.5">
          {fulfillment === 'delivery' ? (
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <Store className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="clamp-2 min-w-0">{destination}</span>
        </p>
      )}
      <p className="flex items-center gap-1.5">
        {method === 'cod' ? (
          <Banknote className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="clamp-1 min-w-0">{payment}</span>
      </p>
    </div>
  );
}
