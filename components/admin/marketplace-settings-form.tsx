'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateMarketplaceSettings } from '@/lib/actions/admin-settings';
import { formatCurrency } from '@/lib/format';

export type MarketplaceSettings = {
  mallName: { fa: string; en?: string | null };
  address: { fa: string; en?: string | null };
  hours: string;
  supportPhone: string;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  currencyLabel: { fa: string; en?: string | null };
};

/**
 * The mall's own details, editable (Prompt A4).
 *
 * The highest-value screen in this set: a client watching their own address,
 * hours and delivery fee change the storefront is watching the platform be
 * theirs rather than a template with their logo on it.
 *
 * Each localised field is TWO inputs, Dari and English, side by side rather
 * than behind a language tab. A tab hides the fact that one of them is empty,
 * and an empty English name is exactly what leaves an English visitor reading
 * Dari — the pair makes the gap visible while you are typing.
 *
 * The delivery numbers carry a live preview of what the storefront will say,
 * formatted through lib/format, because the input is a bare integer and the
 * thing being decided is the sentence a customer reads.
 */
export function MarketplaceSettingsForm({ settings }: { settings: MarketplaceSettings }) {
  const t = useTranslations('adminSettings');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [fee, setFee] = React.useState(String(settings.deliveryFee));
  const [threshold, setThreshold] = React.useState(String(settings.freeDeliveryThreshold));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? '').trim();

    startTransition(async () => {
      const result = await updateMarketplaceSettings({
        mallName: { fa: text('mallNameFa'), en: text('mallNameEn') },
        address: { fa: text('addressFa'), en: text('addressEn') },
        hours: text('hours'),
        supportPhone: text('supportPhone'),
        deliveryFee: Number(text('deliveryFee')),
        freeDeliveryThreshold: Number(text('freeDeliveryThreshold')),
        currencyLabel: { fa: text('currencyFa'), en: text('currencyEn') },
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('saved'));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <LocalizedField
        label={t('mallName')}
        name="mallName"
        value={settings.mallName}
        faLabel={t('inFa')}
        enLabel={t('inEn')}
      />
      <LocalizedField
        label={t('address')}
        name="address"
        value={settings.address}
        faLabel={t('inFa')}
        enLabel={t('inEn')}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hours">{t('hours')}</Label>
          {/* ASCII 24-hour, always. The column is canonical and
              formatOpeningHours() localises it on the way out. */}
          <Input
            id="hours"
            name="hours"
            defaultValue={settings.hours}
            dir="ltr"
            placeholder="08:00-19:00"
            pattern="([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]"
            required
          />
          <p className="text-muted-foreground text-xs">{t('hoursHint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supportPhone">{t('supportPhone')}</Label>
          <Input
            id="supportPhone"
            name="supportPhone"
            defaultValue={settings.supportPhone}
            dir="ltr"
            placeholder="0202201400"
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deliveryFee">{t('deliveryFee')}</Label>
          <Input
            id="deliveryFee"
            name="deliveryFee"
            type="number"
            min={0}
            max={10000}
            dir="ltr"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            required
          />
          <p className="text-muted-foreground text-xs">
            {t('deliveryFeePreview', {
              amount: formatCurrency(Number(fee) || 0, locale),
            })}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="freeDeliveryThreshold">{t('freeDeliveryThreshold')}</Label>
          <Input
            id="freeDeliveryThreshold"
            name="freeDeliveryThreshold"
            type="number"
            min={0}
            max={1000000}
            dir="ltr"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            required
          />
          <p className="text-muted-foreground text-xs">
            {t('freeDeliveryPreview', {
              amount: formatCurrency(Number(threshold) || 0, locale),
            })}
          </p>
        </div>
      </div>

      <LocalizedField
        label={t('currencyLabel')}
        name="currency"
        value={settings.currencyLabel}
        faLabel={t('inFa')}
        enLabel={t('inEn')}
      />

      <Button type="submit" disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}

function LocalizedField({
  label,
  name,
  value,
  faLabel,
  enLabel,
}: {
  label: string;
  name: string;
  value: { fa: string; en?: string | null };
  faLabel: string;
  enLabel: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${name}Fa`} className="text-2xs text-muted-foreground">
            {faLabel}
          </Label>
          <Input id={`${name}Fa`} name={`${name}Fa`} defaultValue={value.fa} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${name}En`} className="text-2xs text-muted-foreground">
            {enLabel}
          </Label>
          <Input id={`${name}En`} name={`${name}En`} defaultValue={value.en ?? ''} dir="ltr" />
        </div>
      </div>
    </fieldset>
  );
}
