'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, Check, TicketPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { requestCampaign } from '@/lib/actions/shop-promotions';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { CAMPAIGN_WEEK_OPTIONS } from '@/lib/promotions';

export type SlotCard = {
  id: string;
  key: string;
  name: string;
  capacity: number;
  available: number;
  pricePerWeek: number;
  /** Show the product picker at all. */
  acceptsProduct: boolean;
  /** Block submission without one — the hero accepts a product but does not need it. */
  needsProduct: boolean;
  mine: number;
};

export type BookableProduct = { id: string; title: string; price: number };

/**
 * Slot inventory and the booking flow (PRD §6.4, §8.2).
 *
 * The booking sheet walks pick-product → duration → summary in one panel rather
 * than a multi-page wizard: it is three decisions, and a shopkeeper on a phone
 * should be able to see the total before committing. The summary states plainly
 * that the request needs approval, because a booking that silently sits in
 * "requested" would read as a broken button.
 */
export function SlotGrid({
  slots,
  products,
  now,
}: {
  slots: SlotCard[];
  products: BookableProduct[];
  /** ISO timestamp from the server: a client component may not read the clock
   *  during render (React 19 purity). */
  now: string;
}) {
  const t = useTranslations('shopPromotions.featured');
  const locale = useLocale();
  const [booking, setBooking] = React.useState<SlotCard | null>(null);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const soldOut = slot.available <= 0;
          return (
            <li
              key={slot.id}
              className="rounded-card border-border bg-card flex flex-col gap-2 border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold">{slot.name}</h3>
                {slot.mine > 0 && (
                  <Badge variant="success">
                    <Check className="h-3 w-3" aria-hidden />
                    {t('yours')}
                  </Badge>
                )}
              </div>

              <p className="text-foreground text-base font-bold">
                {t('perWeek', { price: formatCurrency(slot.pricePerWeek, locale) })}
              </p>

              <p className="text-muted-foreground text-xs">
                {soldOut
                  ? t('soldOut')
                  : t('availability', {
                      available: formatNumber(slot.available, locale),
                      capacity: formatNumber(slot.capacity, locale),
                    })}
              </p>

              <Button
                size="sm"
                variant={soldOut ? 'outline' : 'default'}
                disabled={soldOut}
                onClick={() => setBooking(slot)}
                className="mt-auto"
              >
                <TicketPlus />
                {t('book')}
              </Button>
            </li>
          );
        })}
      </ul>

      <BookingSheet slot={booking} products={products} now={now} onClose={() => setBooking(null)} />
    </>
  );
}

function BookingSheet({
  slot,
  products,
  now,
  onClose,
}: {
  slot: SlotCard | null;
  products: BookableProduct[];
  now: string;
  onClose: () => void;
}) {
  const t = useTranslations('shopPromotions.featured');
  const locale = useLocale();
  const router = useRouter();

  const [weeks, setWeeks] = React.useState(2);
  const [productId, setProductId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Reset the choices whenever a different slot is opened — adjusted during
  // render, not in an effect.
  const [lastSlotId, setLastSlotId] = React.useState<string | null>(slot?.id ?? null);
  if (lastSlotId !== (slot?.id ?? null)) {
    setLastSlotId(slot?.id ?? null);
    setWeeks(2);
    setProductId(null);
  }

  if (!slot) return null;

  // Bound to a const so the null-narrowing survives into the submit closure.
  const booked = slot;
  const total = slot.pricePerWeek * weeks;
  const endsAt = new Date(new Date(now).getTime() + weeks * 7 * 86_400_000);
  const ready = !slot.needsProduct || productId !== null;
  const acceptsProduct = slot.acceptsProduct;

  function submit() {
    startTransition(async () => {
      const result = await requestCampaign({
        slotId: booked.id,
        // Sent whenever the slot accepts one, so an optional hero product is kept.
        productId: acceptsProduct ? productId : null,
        weeks,
      });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('requested'));
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{slot.name}</SheetTitle>
          <SheetDescription>{t('bookingIntro')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-4">
          {acceptsProduct && (
            <div className="space-y-1.5">
              <Label>{slot.needsProduct ? t('pickProduct') : t('pickProductOptional')}</Label>
              {products.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('noPublishedProducts')}</p>
              ) : (
                <ul className="border-border rounded-control max-h-56 space-y-1 overflow-y-auto border p-2">
                  {products.map((product) => (
                    <li key={product.id}>
                      <label className="rounded-control flex cursor-pointer items-center gap-2 p-1.5 text-sm hover:bg-neutral-50">
                        <input
                          type="radio"
                          name="campaign-product"
                          className="accent-primary"
                          checked={productId === product.id}
                          onChange={() => setProductId(product.id)}
                        />
                        <span className="clamp-1 flex-1">{product.title}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {formatCurrency(product.price, locale)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('duration')}</Label>
            <RadioGroup
              value={String(weeks)}
              onValueChange={(value) => setWeeks(Number(value))}
              className="flex flex-wrap gap-3"
            >
              {CAMPAIGN_WEEK_OPTIONS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={String(option)} />
                  {t('weeks', { count: formatNumber(option, locale) })}
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Summary — the total and the end date, before anything is committed. */}
          <div className="rounded-card bg-primary-50 space-y-1.5 p-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t('summaryWeeks')}</span>
              <span>{t('weeks', { count: formatNumber(weeks, locale) })}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
                {t('summaryUntil')}
              </span>
              <span>{formatDate(endsAt, locale)}</span>
            </div>
            <div className="border-primary-200 flex items-center justify-between border-t pt-1.5 text-base font-bold">
              <span>{t('summaryTotal')}</span>
              <span>{formatCurrency(total, locale)}</span>
            </div>
          </div>

          {/* Set the expectation before the tap, not after. */}
          <p className="text-muted-foreground text-xs">{t('needsApproval')}</p>
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !ready}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
