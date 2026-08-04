'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { createCampaignForShop } from '@/lib/actions/admin-promotions';
// Persian digits, not `\D`: JS classes are ASCII-only, so an ASCII
// sanitiser deletes «۵۰۰» keystroke by keystroke and the field a Dari
// admin types into stays empty. One shared helper, lib/digits.ts.
import { digitsOnly } from '@/lib/digits';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { CAMPAIGN_WEEK_OPTIONS } from '@/lib/promotions';

export type ManualSlot = {
  id: string;
  name: string;
  pricePerWeek: number;
  /** Show the product picker at all. */
  acceptsProduct: boolean;
  /** Block submission without one. The hero accepts but does not require. */
  needsProduct: boolean;
  available: number;
};

export type ManualShop = { id: string; name: string };
export type ManualProduct = { id: string; shopId: string; title: string };

/**
 * Admin books a placement on a shop's behalf — the offline sales path (PRD §7.3).
 *
 * A tenant agrees a placement at the management office and never opens the
 * dashboard, so this exists and lands the campaign live rather than requested:
 * there is nobody left to approve it. The price defaults to list but is editable,
 * because a deal struck in person may not be list price.
 */
export function ManualCampaignDialog({
  slots,
  shops,
  products,
  open: controlledOpen,
  onOpenChange,
  prefill,
}: {
  slots: ManualSlot[];
  shops: ManualShop[];
  products: ManualProduct[];
  /**
   * CONTROLLED MODE, for the calendar's vacant cells (Prompt C12).
   *
   * The calendar drew «۳ خالی» in green on every unsold slot-day — the exact
   * squares a shopkeeper rings the office about — and clicking one filtered a
   * list. Now a vacant cell opens THIS dialog with the slot and the day already
   * chosen, which is the difference between a report and a sales tool.
   *
   * Uncontrolled when these are omitted, so the page header's own «افزودن»
   * button keeps working unchanged. There is exactly ONE booking path
   * (`createCampaignForShop`); this is a second way to reach it, not a second
   * implementation of it.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Slot and start day to open with. The reader may still change both. */
  prefill?: { slotId?: string; startsAt?: string } | null;
}) {
  const t = useTranslations('adminPromotions.manual');
  const locale = useLocale();
  const router = useRouter();

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlled) onOpenChange?.(next);
      else setUncontrolledOpen(next);
    },
    [controlled, onOpenChange],
  );

  const [pending, startTransition] = React.useTransition();
  const [slotId, setSlotId] = React.useState('');
  const [shopId, setShopId] = React.useState('');
  const [productId, setProductId] = React.useState('');
  const [weeks, setWeeks] = React.useState(2);
  const [priceOverride, setPriceOverride] = React.useState('');

  /*
   * The prefill applied during RENDER, not in an effect.
   *
   * React 19's lint rule forbids a synchronous setState inside an effect
   * (CLAUDE.md), and the adjust-during-render pattern is what the slot editor
   * already uses for the same shape of problem. `lastPrefill` is the identity
   * of the prefill we have already honoured, so a reader who deliberately
   * changes the slot after opening does not have it snapped back on every
   * keystroke elsewhere in the form.
   */
  const prefillKey = prefill ? `${prefill.slotId ?? ''}|${prefill.startsAt ?? ''}` : '';
  const [lastPrefill, setLastPrefill] = React.useState(prefillKey);
  if (prefillKey && lastPrefill !== prefillKey) {
    setLastPrefill(prefillKey);
    setSlotId(prefill?.slotId ?? '');
    setProductId('');
    // One week is the unit placement is sold in, and a cell click is a
    // question about ONE gap — not an offer to fill the fortnight after it.
    setWeeks(1);
    setPriceOverride('');
  }

  /** Opened from a vacant calendar cell — see the SelectContent note below. */
  const fromCalendar = Boolean(prefill?.startsAt);

  const slot = slots.find((entry) => entry.id === slotId) ?? null;
  const shopProducts = products.filter((product) => product.shopId === shopId);

  const listPrice = slot ? slot.pricePerWeek * weeks : 0;
  const finalPrice = priceOverride === '' ? listPrice : Number(priceOverride) || 0;

  // The picker appears whenever the slot can use a product; only a required slot
  // blocks submission without one.
  const acceptsProduct = slot?.acceptsProduct ?? false;
  const needsProduct = slot?.needsProduct ?? false;
  const ready =
    Boolean(slot) && Boolean(shopId) && (!needsProduct || Boolean(productId)) && weeks > 0;

  function reset() {
    setSlotId('');
    setShopId('');
    setProductId('');
    setWeeks(2);
    setPriceOverride('');
    /*
     * The honoured-prefill marker is cleared too, or clicking the SAME vacant
     * cell twice opens an empty sheet: the key would still match the one we
     * already applied, the guard above would skip, and the fields reset() just
     * blanked would stay blank. A silent-wrong-state bug with no error.
     */
    setLastPrefill('');
  }

  function submit() {
    startTransition(async () => {
      const result = await createCampaignForShop({
        slotId,
        shopId,
        // The clicked day, when the dialog was opened from a calendar cell.
        // Omitted otherwise, and the action starts the run today.
        startsAt: prefill?.startsAt,
        // acceptsProduct, not needsProduct: an optional product chosen for the hero
        // must still be sent, or the picker silently does nothing.
        productId: acceptsProduct ? productId || null : null,
        weeks,
        pricePaid: priceOverride === '' ? undefined : finalPrice,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('created', { price: formatCurrency(result.data.pricePaid, locale) }));
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {/* No trigger in controlled mode: the vacant cell IS the trigger, and a
          second button rendered inside the calendar grid would be a stray
          control in a table cell. */}
      {!controlled && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Plus />
            {t('trigger')}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
            WHAT WAS CLICKED, restated at the top of the sheet. A dialog that
            opens with two selects already filled and no explanation looks like
            a form that remembered the wrong thing; naming the day and the slot
            makes it obviously the continuation of the click.
          */}
          {prefill?.startsAt && (
            <p
              className="rounded-control bg-primary-50 text-primary-800 p-3 text-xs"
              data-booking-prefill
            >
              {t('fromCalendar', {
                slot: slot?.name ?? '',
                from: formatDate(prefill.startsAt, locale, 'medium'),
                to: formatDate(
                  new Date(new Date(prefill.startsAt).getTime() + weeks * 7 * 86_400_000),
                  locale,
                  'medium',
                ),
              })}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="manual-slot">{t('slot')}</Label>
            <Select
              value={slotId || undefined}
              onValueChange={(value) => {
                setSlotId(value);
                setProductId('');
              }}
            >
              <SelectTrigger id="manual-slot">
                <SelectValue placeholder={t('slotHint')} />
              </SelectTrigger>
              <SelectContent>
                {slots.map((entry) => (
                  /*
                   * `available` IS TODAY'S OCCUPANCY, not the chosen week's.
                   *
                   * That is fine when the dialog is opened cold — "what can I
                   * sell right now" — and actively wrong when it was opened
                   * from a calendar cell, because the cell being green is proof
                   * the slot is free on THAT day. Before this, clicking a vacant
                   * square in Sonbola on a slot that happens to be full today
                   * opened a sheet whose first line read «— پر» and whose slot
                   * option was disabled: the screen contradicting the square the
                   * reader had just clicked.
                   *
                   * `createCampaignForShop` re-checks `slotAvailability` for the
                   * real window and refuses an oversold booking with
                   * `slot_full`, so the authority is the action either way —
                   * this only decides which of two true statements to show.
                   */
                  <SelectItem
                    key={entry.id}
                    value={entry.id}
                    disabled={!fromCalendar && entry.available <= 0}
                  >
                    {entry.name}
                    {!fromCalendar && entry.available <= 0
                      ? ` — ${t('slotFull')}`
                      : ` — ${formatCurrency(entry.pricePerWeek, locale)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-shop">{t('shop')}</Label>
            <Select
              value={shopId || undefined}
              onValueChange={(value) => {
                setShopId(value);
                setProductId('');
              }}
            >
              <SelectTrigger id="manual-shop">
                <SelectValue placeholder={t('shopHint')} />
              </SelectTrigger>
              <SelectContent>
                {shops.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Only approved shops are listed — promoting an invisible shop would
                lead nowhere. */}
            <p className="text-muted-foreground text-xs">{t('shopNote')}</p>
          </div>

          {acceptsProduct && (
            <div className="space-y-1.5">
              <Label htmlFor="manual-product">
                {needsProduct ? t('product') : t('productOptional')}
              </Label>
              <Select
                value={productId || undefined}
                onValueChange={setProductId}
                disabled={!shopId}
              >
                <SelectTrigger id="manual-product">
                  <SelectValue placeholder={shopId ? t('productHint') : t('chooseShopFirst')} />
                </SelectTrigger>
                <SelectContent>
                  {shopProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shopId && shopProducts.length === 0 && (
                <p className="text-danger text-xs">{t('noPublishedProducts')}</p>
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

          <div className="space-y-1.5">
            <Label htmlFor="manual-price">{t('price')}</Label>
            <Input
              id="manual-price"
              inputMode="numeric"
              dir="ltr"
              placeholder={String(listPrice)}
              value={priceOverride}
              onChange={(event) => setPriceOverride(digitsOnly(event.target.value))}
            />
            <p className="text-muted-foreground text-xs">
              {t('priceHint', { list: formatCurrency(listPrice, locale) })}
            </p>
          </div>

          <div className="rounded-card bg-primary-50 flex items-center justify-between p-3">
            <span className="text-sm">{t('total')}</span>
            <span className="text-base font-bold">{formatCurrency(finalPrice, locale)}</span>
          </div>

          <p className="text-muted-foreground text-xs">{t('goesLiveNote')}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !ready}>
            {pending ? t('creating') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
