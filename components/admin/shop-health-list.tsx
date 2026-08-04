import { getLocale, getTranslations } from 'next-intl/server';
import { HeartPulse, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { NudgeShopButton } from '@/components/admin/nudge-shop-button';
import { EmptyState } from '@/components/custom/empty-state';
import { pickLocale } from '@/lib/db/localized';
import { shopHealth, type HealthFlag, type ShopHealth } from '@/lib/db/queries/mall';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatRating,
  formatUnitNumber,
} from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/** Red is a shop turning business away; amber is a shop being slow about it. */
const FLAG_TONE: Record<HealthFlag, string> = {
  slow_acceptance: 'bg-accent-warm/15 text-neutral-800',
  high_rejection: 'bg-danger-bg text-danger',
  falling_rating: 'bg-accent-warm/15 text-neutral-800',
  no_products: 'bg-neutral-100 text-neutral-700',
  verification_expired: 'bg-neutral-100 text-neutral-700',
};

/**
 * A tenant has stopped trading, in days. Past this the silence is the story.
 *
 * Fourteen days is a fortnight of a shopping mall: long enough that a quiet
 * week and a religious holiday do not trip it, short enough that a landlord
 * still has time to do something.
 */
const SILENT_DAYS = 14;
/** Half that, where it is worth a glance but not a phone call. */
const QUIET_DAYS = 7;

/**
 * The tenant roster, ranked by who needs the landlord (Prompt C12).
 *
 * WAS A FILTER, IS NOW A ROSTER. This screen used to render only flagged shops
 * — a list that is empty on a good week and, on a bad one, hides the eleven
 * tenants doing fine behind the three that are not. Neither reading is the one
 * a mall director wants: they want the WHOLE BUILDING with colour on it, in
 * order of who to ring. That is command feel; a filter that hides the healthy
 * is a support queue.
 *
 * FOUR SIGNALS PER TENANT, and every one of them is a number the shopkeeper can
 * be shown on the phone: how long since anyone bought from them, how long
 * customers wait to be accepted, whether the catalogue is still moving, and
 * which way the rating is going. "Slow to accept" is an accusation; "median 19
 * hours over 24 orders" is a fact.
 *
 * A TABLE AT DESKTOP, cards below `lg`. Columns are the entire reason a roster
 * beats a stack of cards — the same fact sits under itself and the eye runs
 * down one column — and a six-column table on a phone is a horizontal
 * scrollbar. Both render from one row set.
 */
export async function ShopHealthList({ days }: { days: number }) {
  const locale = await getLocale();
  const t = await getTranslations('adminShops.health');

  const shops = await shopHealth(days, { includeHealthy: true });

  if (shops.length === 0) {
    return (
      <EmptyState
        illustration={<HeartPulse className="h-7 w-7" aria-hidden />}
        title={t('noShopsTitle')}
        description={t('noShopsBody')}
      />
    );
  }

  const flagged = shops.filter((shop) => shop.flags.length > 0).length;

  const evidence = (shop: ShopHealth, flag: HealthFlag): string => {
    switch (flag) {
      case 'slow_acceptance':
        return t('evidence.slow_acceptance', {
          hours: formatNumber(Math.round(shop.medianAcceptHours ?? 0), locale),
          orders: formatNumber(shop.ordersInWindow, locale),
        });
      case 'high_rejection':
        return t('evidence.high_rejection', {
          rate: formatPercent(shop.rejectionRate, locale),
          orders: formatNumber(shop.ordersInWindow, locale),
        });
      case 'falling_rating':
        return t('evidence.falling_rating', {
          from: formatRating(shop.ratingEarlier ?? 0, locale),
          to: formatRating(shop.ratingRecent ?? 0, locale),
        });
      case 'no_products':
        return t('evidence.no_products');
      case 'verification_expired':
        return t('evidence.verification_expired');
    }
  };

  /** How loud the silence is — the colour on the first column. */
  const silenceTone = (shop: ShopHealth) =>
    shop.daysSinceLastOrder === null || shop.daysSinceLastOrder >= SILENT_DAYS
      ? 'text-danger font-bold'
      : shop.daysSinceLastOrder >= QUIET_DAYS
        ? 'text-warning font-semibold'
        : 'text-neutral-600';

  const lastOrderLabel = (shop: ShopHealth) =>
    shop.daysSinceLastOrder === null
      ? t('neverTraded')
      : shop.daysSinceLastOrder === 0
        ? t('tradedToday')
        : t('daysSinceOrder', {
            n: shop.daysSinceLastOrder,
            count: formatNumber(shop.daysSinceLastOrder, locale),
          });

  const acceptLabel = (shop: ShopHealth) =>
    shop.medianAcceptHours === null
      ? '—'
      : t('medianHours', {
          hours: formatNumber(Math.round(shop.medianAcceptHours), locale),
        });

  /** Catalogue movement as a direction, not a raw count. */
  const catalogueTrend = (shop: ShopHealth) => {
    const delta = shop.productsAdded - shop.productsAddedBefore;
    return {
      delta,
      icon:
        delta > 0 ? (
          <TrendingUp className="text-success h-3.5 w-3.5" aria-hidden />
        ) : delta < 0 ? (
          <TrendingDown className="text-warning h-3.5 w-3.5" aria-hidden />
        ) : (
          <Minus className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
        ),
    };
  };

  /** Rating movement over the window's two halves — null when there is no pair. */
  const ratingDelta = (shop: ShopHealth) =>
    shop.ratingRecent !== null && shop.ratingEarlier !== null
      ? shop.ratingRecent - shop.ratingEarlier
      : null;

  return (
    <div className="space-y-3" data-health-list>
      {/*
        THE ROSTER'S OWN HEADLINE. A list of fourteen tenants with no summary
        makes the reader count the coloured rows themselves.
      */}
      <p className="text-muted-foreground text-xs" data-health-summary>
        {t('rosterSummary', {
          total: formatNumber(shops.length, locale),
          flagged: formatNumber(flagged, locale),
          days: formatNumber(days, locale),
        })}
      </p>

      {/* ---------------------------------------------------------------- */}
      {/*
        `overflow-x-auto`, not `overflow-hidden`. Seven columns of localised
        text have no fixed width — a long shop name, a three-flag evidence
        stack, a currency figure — and a table that outgrows its card under a
        hidden overflow silently CLIPS its last column, which here is the nudge
        button. Scrolling inside the panel is the failure mode; losing a control
        off the inline edge is not.
      */}
      <div className="rounded-card border-border bg-card hidden overflow-x-auto border lg:block">
        <table className="w-full min-w-3xl text-sm">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-xs">
              <th className="p-3 text-start font-normal">{t('colShop')}</th>
              <th className="p-3 text-start font-normal">{t('colLastOrder')}</th>
              <th className="p-3 text-start font-normal">{t('colAccept')}</th>
              <th className="p-3 text-start font-normal">{t('colCatalogue')}</th>
              <th className="p-3 text-start font-normal">{t('colRating')}</th>
              <th className="p-3 text-end font-normal">{t('colRevenue')}</th>
              <th className="p-3 text-end font-normal">
                <span className="sr-only">{t('nudge')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {shops.map((shop) => {
              const trend = catalogueTrend(shop);
              const rating = ratingDelta(shop);

              return (
                <tr
                  key={shop.id}
                  data-health-flags={shop.flags.length}
                  /* A tinted row, not a red one: this is a roster and most of
                     it is fine. Only the flagged rows lift off the ground. */
                  className={cn(shop.flags.length > 0 && 'bg-warning-bg/40')}
                >
                  <td className="p-3">
                    <Link
                      href={`/admin/shops/${shop.id}`}
                      className="hover:text-primary font-medium"
                    >
                      {pickLocale(shop.name, locale)}
                    </Link>
                    {shop.floor !== null && (
                      <span className="text-muted-foreground block text-xs">
                        {t('floorUnit', {
                          floor: formatNumber(shop.floor, locale),
                          unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                        })}
                      </span>
                    )}
                    {/* The flags, with their evidence, under the name they are
                        about — the pairing this screen has always been built on. */}
                    {shop.flags.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {shop.flags.map((flag) => (
                          <li key={flag} className="text-2xs flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                'rounded-control shrink-0 px-1.5 py-0.5 font-semibold',
                                FLAG_TONE[flag],
                              )}
                            >
                              {t(`flags.${flag}` as never)}
                            </span>
                            <span className="text-muted-foreground">{evidence(shop, flag)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Vacation mode, announced before the phone call — the
                        shopkeeper set it themselves (shops.pausedUntil). */}
                    {shop.paused && shop.pausedUntil && (
                      <span className="rounded-control mt-1.5 inline-block bg-neutral-100 px-2 py-0.5 text-2xs font-semibold text-neutral-700">
                        {t('pausedUntil', {
                          date: formatDate(shop.pausedUntil, locale, 'medium'),
                        })}
                      </span>
                    )}
                  </td>

                  <td className={cn('p-3 align-top text-xs tabular-nums', silenceTone(shop))}>
                    {lastOrderLabel(shop)}
                  </td>

                  <td className="text-muted-foreground p-3 align-top text-xs tabular-nums">
                    {acceptLabel(shop)}
                  </td>

                  <td className="p-3 align-top text-xs">
                    <span className="flex items-center gap-1.5 tabular-nums">
                      {trend.icon}
                      {t('catalogueTrend', {
                        published: formatNumber(shop.publishedProducts, locale),
                        added: formatNumber(shop.productsAdded, locale),
                      })}
                    </span>
                  </td>

                  <td className="p-3 align-top text-xs tabular-nums">
                    {shop.ratingRecent === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          rating !== null && rating <= -0.5 && 'text-danger font-semibold',
                          rating !== null && rating >= 0.5 && 'text-success font-semibold',
                        )}
                      >
                        {formatRating(shop.ratingRecent, locale)}
                        {rating !== null && rating !== 0 && (
                          <span className="text-muted-foreground ms-1">
                            {rating > 0 ? '▲' : '▼'} {formatRating(Math.abs(rating), locale)}
                          </span>
                        )}
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-end align-top text-xs font-semibold tabular-nums">
                    {formatCurrency(shop.revenue, locale)}
                  </td>

                  <td className="p-3 text-end align-top">
                    {/* The landlord's only move: they cannot fix a tenant's
                        queue for them (PRD §3.1), but they can make sure the
                        tenant knows. Offered where there is something to say. */}
                    {shop.flags.length > 0 && (
                      <NudgeShopButton shopId={shop.id} flags={shop.flags} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------------- */}
      <ul className="space-y-2 lg:hidden">
        {shops.map((shop) => (
          <li
            key={shop.id}
            data-health-flags={shop.flags.length}
            className={cn(
              'rounded-card border-border space-y-2.5 border p-4',
              shop.flags.length > 0 ? 'bg-warning-bg/40' : 'bg-card',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/shops/${shop.id}`}
                  className="hover:text-primary text-sm font-bold"
                >
                  {pickLocale(shop.name, locale)}
                </Link>
                {shop.floor !== null && (
                  <p className="text-muted-foreground text-xs">
                    {t('floorUnit', {
                      floor: formatNumber(shop.floor, locale),
                      unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                    })}
                  </p>
                )}
              </div>
              {shop.flags.length > 0 && <NudgeShopButton shopId={shop.id} flags={shop.flags} />}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('colLastOrder')}</dt>
                <dd className={cn('tabular-nums', silenceTone(shop))}>{lastOrderLabel(shop)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('colAccept')}</dt>
                <dd className="tabular-nums">{acceptLabel(shop)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('colCatalogue')}</dt>
                <dd className="tabular-nums">
                  {t('catalogueTrend', {
                    published: formatNumber(shop.publishedProducts, locale),
                    added: formatNumber(shop.productsAdded, locale),
                  })}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('colRevenue')}</dt>
                <dd className="font-semibold tabular-nums">
                  {formatCurrency(shop.revenue, locale)}
                </dd>
              </div>
            </dl>

            {shop.flags.length > 0 && (
              <ul className="space-y-1.5">
                {shop.flags.map((flag) => (
                  <li key={flag} className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'rounded-control shrink-0 px-2 py-0.5 font-semibold',
                        FLAG_TONE[flag],
                      )}
                    >
                      {t(`flags.${flag}` as never)}
                    </span>
                    <span className="text-muted-foreground">{evidence(shop, flag)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
