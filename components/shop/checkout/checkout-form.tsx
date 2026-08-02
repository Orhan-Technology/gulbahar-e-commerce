'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote, MapPin, Plus, Smartphone, Store } from 'lucide-react';
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
  const [addressId, setAddressId] = React.useState(addresses[0]?.id ?? '');
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
                      <span className="font-medium">{address.label}</span>
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
                  <Input id="addrPhone" name="phone" required dir="ltr" placeholder="0700000000" />
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

          <Button
            type="button"
            onClick={onPlaceOrder}
            size="lg"
            className="w-full"
            disabled={pending}
          >
            {pending
              ? t('placing')
              : paymentMethod === 'hesabpay'
                ? t('payAndPlace')
                : t('placeOrder')}
          </Button>
        </section>
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
