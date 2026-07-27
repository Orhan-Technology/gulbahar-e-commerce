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
import { formatCurrency, formatNumber } from '@/lib/format';
import { CAMPAIGN_WEEK_OPTIONS } from '@/lib/promotions';

export type ManualSlot = {
  id: string;
  name: string;
  pricePerWeek: number;
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
}: {
  slots: ManualSlot[];
  shops: ManualShop[];
  products: ManualProduct[];
}) {
  const t = useTranslations('adminPromotions.manual');
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [slotId, setSlotId] = React.useState('');
  const [shopId, setShopId] = React.useState('');
  const [productId, setProductId] = React.useState('');
  const [weeks, setWeeks] = React.useState(2);
  const [priceOverride, setPriceOverride] = React.useState('');

  const slot = slots.find((entry) => entry.id === slotId) ?? null;
  const shopProducts = products.filter((product) => product.shopId === shopId);

  const listPrice = slot ? slot.pricePerWeek * weeks : 0;
  const finalPrice = priceOverride === '' ? listPrice : Number(priceOverride) || 0;

  // A product-level slot needs one, and it has to belong to the chosen shop.
  const needsProduct = slot?.needsProduct ?? false;
  const ready =
    Boolean(slot) && Boolean(shopId) && (!needsProduct || Boolean(productId)) && weeks > 0;

  function reset() {
    setSlotId('');
    setShopId('');
    setProductId('');
    setWeeks(2);
    setPriceOverride('');
  }

  function submit() {
    startTransition(async () => {
      const result = await createCampaignForShop({
        slotId,
        shopId,
        productId: needsProduct ? productId : null,
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
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus />
          {t('trigger')}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                  <SelectItem key={entry.id} value={entry.id} disabled={entry.available <= 0}>
                    {entry.name}
                    {entry.available <= 0
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

          {needsProduct && (
            <div className="space-y-1.5">
              <Label htmlFor="manual-product">{t('product')}</Label>
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
              onChange={(event) => setPriceOverride(event.target.value.replace(/\D/g, ''))}
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
