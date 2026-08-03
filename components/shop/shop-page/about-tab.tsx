import { getLocale, getTranslations } from 'next-intl/server';
import { BadgeCheck, CalendarClock, MapPin, Phone } from 'lucide-react';

import { ShopFloorMap } from '@/components/shop/shop-page/shop-floor-map';
import { WeeklyHours } from '@/components/shop/shop-page/weekly-hours';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { formatDate, formatNumber, formatPhone, formatUnitNumber } from '@/lib/format';

export type AboutShop = {
  name: LocalizedText;
  description: LocalizedText | null;
  story: LocalizedText | null;
  floor: number | null;
  unitNumber: string | null;
  phone: string | null;
  hours: string | null;
  tenantSince: Date | null;
  verifiedAt: Date | null;
};

/**
 * The About tab (Prompt C8).
 *
 * THE STORY IS THE POINT. Everything else here — hours, phone, unit — is also
 * in the hero or a click away; what only this tab has is a paragraph in the
 * shopkeeper's own voice about who they are and what they do differently. That
 * paragraph is the difference between a marketplace listing and a shop.
 *
 * YEARS AT THE MALL is rendered as an ELAPSED COUNT, never as a calendar year.
 * A year number would have to be printed in some calendar, and a fa reader
 * counts in Hijri Shamsi while the column holds Gregorian — "eleven years" is
 * the same number in both, and it is also the fact anyone actually wants.
 *
 * The VERIFICATION panel repeats what the badge's popover says, at length. The
 * badge is a mark you notice; this is where someone who stopped to wonder what
 * it means gets a full answer without having to find a tooltip.
 */
export async function AboutTab({ shop, now }: { shop: AboutShop; now: Date }) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.about');

  const years = shop.tenantSince
    ? Math.max(1, Math.floor((now.getTime() - shop.tenantSince.getTime()) / 31_557_600_000))
    : null;

  /*
   * HOURS ARE NOT IN THIS GRID ANY MORE. They used to be one fact card showing
   * the usual range, which is exactly the rendering that hid a Friday closure —
   * the whole week now has its own block below, and a single line here would
   * either repeat it or contradict it.
   */
  const facts = [
    shop.phone && {
      key: 'phone',
      icon: Phone,
      label: t('phoneLabel'),
      value: formatPhone(shop.phone, locale),
      dir: 'ltr' as const,
    },
    shop.floor !== null && {
      key: 'location',
      icon: MapPin,
      label: t('locationLabel'),
      value: t('floorUnitValue', {
        floor: formatNumber(shop.floor, locale),
        unit: formatUnitNumber(shop.unitNumber, locale) || '—',
      }),
      dir: undefined,
    },
    years !== null && {
      key: 'tenure',
      icon: CalendarClock,
      label: t('tenureLabel'),
      value: t('tenureValue', { years: formatNumber(years, locale) }),
      dir: undefined,
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: typeof Phone;
    label: string;
    value: string;
    dir?: 'ltr';
  }>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          <h2 className="text-base font-bold">{t('storyTitle')}</h2>
          {/* `dir="auto"` on both: this is the shopkeeper's own prose, and the
              paragraph has to take its direction from the text rather than from
              the page around it. */}
          {shop.story ? (
            <p dir="auto" className="text-sm leading-relaxed text-neutral-700">
              {pickLocale(shop.story, locale)}
            </p>
          ) : shop.description ? (
            <p dir="auto" className="text-sm leading-relaxed text-neutral-700">
              {pickLocale(shop.description, locale)}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">{t('noStory')}</p>
          )}
        </section>

        {/* The full weekly schedule, with today marked (Prompt: per-day hours). */}
        <WeeklyHours hours={shop.hours} now={now} />

        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div
              key={fact.key}
              className="rounded-card border-border bg-card flex items-start gap-3 border p-3"
            >
              <span className="rounded-control bg-primary-50 text-primary-700 flex h-9 w-9 shrink-0 items-center justify-center">
                <fact.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <dt className="text-muted-foreground text-xs">{fact.label}</dt>
                <dd className="text-sm font-semibold" dir={fact.dir}>
                  {fact.value}
                </dd>
              </span>
            </div>
          ))}
        </dl>

        {shop.verifiedAt && (
          <section className="rounded-card border-primary-200 bg-primary-50/60 flex gap-3 border p-4">
            <BadgeCheck className="text-primary h-5 w-5 shrink-0" aria-hidden />
            <div className="space-y-1">
              <h2 className="text-primary-900 text-sm font-bold">{t('verifiedTitle')}</h2>
              <p className="text-primary-900/80 text-sm leading-relaxed">{t('verifiedBody')}</p>
              <p className="text-primary-900/60 text-xs">
                {t('verifiedOn', { date: formatDate(shop.verifiedAt, locale, 'medium') })}
              </p>
            </div>
          </section>
        )}
      </div>

      {/*
        The REAL floor map now (Prompt C11), not the schematic C8 shipped as a
        placeholder: same units, same neighbours, the shop's own unit lit up,
        and every other unit a link. The neighbours were the part the schematic
        could not honestly draw.
      */}
      {shop.floor !== null && <ShopFloorMap floor={shop.floor} unitNumber={shop.unitNumber} />}
    </div>
  );
}
