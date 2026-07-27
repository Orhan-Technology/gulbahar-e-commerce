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
import { HesabPaySheet } from '@/components/shop/checkout/hesabpay-sheet';
import { saveAddress } from '@/lib/actions/account';
import { placeOrder } from '@/lib/actions/checkout';
import { formatCurrency } from '@/lib/format';
import { useRouter } from '@/lib/i18n/navigation';
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
  /** Cart total before any delivery fee. */
  cartTotal: number;
  deliveryFee: number;
  freeDeliveryThreshold: number;
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
  cartTotal,
  deliveryFee,
  freeDeliveryThreshold,
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

  const effectiveFee =
    fulfillment === 'delivery' && cartTotal < freeDeliveryThreshold ? deliveryFee : 0;
  const grandTotal = cartTotal + effectiveFee;

  function submitOrder() {
    startTransition(async () => {
      const result = await placeOrder({
        fulfillment,
        paymentMethod,
        addressId: fulfillment === 'delivery' ? addressId : undefined,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

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
                        {address.phone}
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
            <ul className="space-y-1.5 pt-1">
              {pickupShops.map((shop) => (
                <li key={shop.shopId} className="flex items-center gap-2 text-sm">
                  <Store className="text-primary-700 h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate font-medium">{shop.name}</span>
                  {shop.floor !== null && (
                    <span className="text-muted-foreground ms-auto shrink-0 text-xs">
                      {t('floorUnit', { floor: shop.floor, unit: shop.unitNumber ?? '—' })}
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

        {/* Totals + submit */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
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
