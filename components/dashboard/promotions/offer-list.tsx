'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Pencil, Percent, Square, Tag } from 'lucide-react';
import { toast } from 'sonner';

import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { endOffer } from '@/lib/actions/shop-promotions';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { OfferDialog, type OfferDraft, type OfferProduct } from './offer-dialog';

export type OfferRow = {
  id: string;
  name: string;
  nameFa: string;
  nameEn: string;
  type: 'percent' | 'fixed';
  value: number;
  scope: 'shop' | 'products';
  productIds: string[];
  productCount: number | null;
  startsAt: string;
  endsAt: string;
  phase: 'active' | 'scheduled' | 'expired';
  /**
   * How the offer actually did — every figure PRE-FORMATTED on the server, the
   * same division of labour the action queue uses. The client formats no money
   * and no numbers, so Persian digits and the ؋ prefix cannot drift between this
   * panel and the rest of the dashboard.
   */
  performance: OfferPerformanceView;
};

export type OfferPerformanceView = {
  /** Nothing to show yet, with the reason already translated. */
  note: string | null;
  units: string;
  revenue: string;
  baselineUnits: string;
  baselineRevenue: string;
  /** "compared with the ۷ days before" — the window, stated. */
  windowLabel: string;
};

/**
 * Offers grouped into active / scheduled / expired (PRD §6.4).
 *
 * Three sections rather than one list with status badges, because the question a
 * shopkeeper actually has is "what is running right now" — and that answer should
 * not require reading dates on ten rows.
 */
export function OfferList({
  offers,
  products,
  now,
}: {
  offers: OfferRow[];
  products: OfferProduct[];
  now: string;
}) {
  const t = useTranslations('shopPromotions.offers');

  const sections = [
    { phase: 'active' as const, rows: offers.filter((offer) => offer.phase === 'active') },
    { phase: 'scheduled' as const, rows: offers.filter((offer) => offer.phase === 'scheduled') },
    { phase: 'expired' as const, rows: offers.filter((offer) => offer.phase === 'expired') },
  ];

  return (
    <div className="space-y-5">
      {sections.map((section) =>
        section.rows.length === 0 ? null : (
          <section key={section.phase} className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-bold uppercase">
              {t(`sections.${section.phase}`)}
            </h3>
            <ul className="space-y-2">
              {section.rows.map((offer) => (
                <OfferCard key={offer.id} offer={offer} products={products} now={now} />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function OfferCard({
  offer,
  products,
  now,
}: {
  offer: OfferRow;
  products: OfferProduct[];
  now: string;
}) {
  const t = useTranslations('shopPromotions.offers');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const draft: OfferDraft = {
    id: offer.id,
    nameFa: offer.nameFa,
    nameEn: offer.nameEn,
    type: offer.type,
    value: String(offer.value),
    scope: offer.scope,
    productIds: offer.productIds,
    // The dialog's inputs are datetime-local, which wants local wall-clock time.
    startsAt: offer.startsAt.slice(0, 16),
    endsAt: offer.endsAt.slice(0, 16),
  };

  return (
    <li className="rounded-card border-border bg-card space-y-2 border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* The shopkeeper's own name for the offer — user-generated, so it
              sets its own base direction. */}
          <p className="clamp-1 text-sm font-medium" dir="auto">
            {offer.name}
          </p>

          {/*
            EACH FRAGMENT ISOLATED, for the reason spelled out on the campaign
            card (campaign-list.tsx). «۲۵٪ تخفیف · ۱ محصول» in one RTL text run
            rendered as «تخفیف ۱ محصول ۲۵٪» with the percent sign orphaned onto
            the next line and the middle dot swallowed: three numeric runs
            separated by neutrals let the bidi algorithm resolve across the
            separators, and the card ended up advertising a discount it does not
            offer. `<bdi>` is the element for a run whose direction must not
            leak into its neighbours; the separator is its own span so nothing
            is resolved through it.
          */}
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
            {offer.type === 'percent' ? (
              <Percent className="h-3 w-3 shrink-0" aria-hidden />
            ) : (
              <Tag className="h-3 w-3 shrink-0" aria-hidden />
            )}
            <bdi>
              {offer.type === 'percent'
                ? t('percentOff', { value: formatNumber(offer.value, locale) })
                : t('fixedOff', { value: formatCurrency(offer.value, locale) })}
            </bdi>
            <span aria-hidden>·</span>
            <bdi>
              {offer.scope === 'shop'
                ? t('wholeShop')
                : t('productScope', {
                    // `n` selects the plural form, `count` renders — see
                    // dashboard.ratingCount. Without it English says "1 products".
                    n: offer.productCount ?? 0,
                    count: formatNumber(offer.productCount ?? 0, locale),
                  })}
            </bdi>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <OfferDialog
            initial={draft}
            now={now}
            products={products}
            trigger={
              <Button variant="ghost" size="icon" aria-label={t('edit')}>
                <Pencil />
              </Button>
            }
          />
          {offer.phase !== 'expired' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('end')}
              disabled={pending}
              className="hover:text-danger text-neutral-500"
              onClick={() =>
                startTransition(async () => {
                  const result = await endOffer(offer.id);
                  if (!result.ok) toast.error(t(`errors.${result.error}` as never));
                  else {
                    toast.success(t('ended'));
                    router.refresh();
                  }
                })
              }
            >
              <Square />
            </Button>
          )}
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {/* Same isolation, same reason: «۲۹ سرطان ۱۴۰۵ — ۱۲ اسد ۱۴۰۵» let the
            first date's day number break off and float to the far end of the
            line, so the card showed a range that started nowhere. */}
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
          <bdi>{formatDate(offer.startsAt, locale)}</bdi>
          <span aria-hidden>—</span>
          <bdi>{formatDate(offer.endsAt, locale)}</bdi>
        </span>
        {/* The same countdown the storefront shows, so what the shopkeeper sees
            here is literally what the customer sees. */}
        {offer.phase === 'active' && <OfferCountdown endsAt={offer.endsAt} />}
        {offer.phase === 'scheduled' && <Badge variant="secondary">{t('notStarted')}</Badge>}
      </div>

      <OfferPerformanceBlock performance={offer.performance} />
    </li>
  );
}

/**
 * What the offer sold, beside what the same stretch of time sold before it.
 *
 * TWO COLUMNS AND A CAPTION, no lift percentage. The caption says these are
 * fulfilled orders in the window and that the shop is being shown a comparison,
 * not an attribution — a "+34%" here would be read as "the discount earned
 * this", which nothing in the data supports. The honest empty state is a
 * sentence, not two zeros in a grid: zeros look like a broken readout.
 */
function OfferPerformanceBlock({ performance }: { performance: OfferPerformanceView }) {
  const t = useTranslations('shopPromotions.offers.performance');

  if (performance.note) {
    return (
      <p className="rounded-control text-muted-foreground bg-neutral-50 px-3 py-2 text-xs">
        {performance.note}
      </p>
    );
  }

  return (
    <div className="rounded-control space-y-1.5 bg-neutral-50 p-3">
      <p className="text-2xs font-bold text-neutral-500">{t('heading')}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-muted-foreground">{t('duringUnits')}</dt>
          <dd className="font-bold tabular-nums">{performance.units}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('duringRevenue')}</dt>
          <dd className="font-bold tabular-nums">{performance.revenue}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('beforeUnits')}</dt>
          <dd className="tabular-nums">{performance.baselineUnits}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('beforeRevenue')}</dt>
          <dd className="tabular-nums">{performance.baselineRevenue}</dd>
        </div>
      </dl>

      <p className="text-2xs text-neutral-500">{performance.windowLabel}</p>
      {/* Say out loud what this is not. */}
      <p className="text-2xs text-neutral-400">{t('caveat')}</p>
    </div>
  );
}
