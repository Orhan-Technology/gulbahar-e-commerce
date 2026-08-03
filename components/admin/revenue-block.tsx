import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { revenueBySlot, revenueMonthToDate } from '@/lib/db/queries/admin-revenue';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The client's slide, on the overview (PRD §7.3, §10.8).
 *
 * This is the "this is your new income" moment, so it is a HEADLINE and not a
 * table: one large figure for the month, the occupancy of the inventory that
 * produced it, and the three placements earning most. Anything more belongs on
 * /admin/revenue, which the whole block links to.
 *
 * Occupancy is the second number on purpose. Income alone says how the month
 * went; income beside "seven of eight places sold" says whether there is room
 * to grow it, which is the question a mall manager asks next.
 *
 * EVERY MONEY FIGURE ON THIS CARD NAMES ITS PERIOD, and that is a repair. The
 * headline was month-to-date and the top-three list under it was LIFETIME, so
 * on the 2nd of a month the card read «۰ ؋ ↓۱۰۰٪» directly above a breakdown
 * summing to nine hundred thousand — the block contradicting itself inside one
 * blue rectangle, on the first number the console exists to sell.
 *
 * Three changes, together:
 *   - the comparison is the SAME STRETCH of last month (revenueMonthToDate),
 *     not month-so-far against a whole previous month, so a two-day-old month
 *     no longer scores −100%;
 *   - BOOKED VALUE sits beside recognized income, because placement running on
 *     the walls today is the thing a bare zero was denying;
 *   - the breakdown carries its own period label instead of borrowing the
 *     headline's by adjacency.
 */
export async function RevenueBlock() {
  const locale = await getLocale();
  const t = await getTranslations('adminOverview.revenue');

  const [month, slots] = await Promise.all([revenueMonthToDate(), revenueBySlot()]);

  const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const occupied = slots.reduce((sum, slot) => sum + slot.occupied, 0);
  // Clamped: an oversold slot would otherwise draw a bar past its track.
  const fill = capacity > 0 ? Math.min(occupied / capacity, 1) : 0;

  const top = [...slots]
    .filter((slot) => slot.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);
  const lifetimeTotal = slots.reduce((sum, slot) => sum + slot.revenue, 0);

  const positive = (month.delta ?? 0) >= 0;

  return (
    <section className="rounded-card bg-primary-700 text-primary-foreground p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-primary-300 text-sm font-semibold">{t('heading')}</h2>
        <Link
          href="/admin/revenue"
          className={cn(
            pressable,
            'text-primary-200 hover:text-primary-foreground inline-flex items-center gap-1 text-xs font-semibold transition-[color,scale] duration-150 ease-out',
          )}
        >
          {t('viewAll')}
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
        </Link>
      </div>

      {/* The period, on the figure rather than inferable from the heading. */}
      <p className="text-primary-300 mt-3 text-2xs font-semibold">
        {month.partial
          ? t('recognisedLabel', { day: formatNumber(month.dayOfMonth, locale) })
          : t('recognisedFullLabel')}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <p className="text-3xl leading-none font-extrabold tabular-nums">
          {formatCurrency(month.current, locale)}
        </p>
        {month.delta !== null && month.delta !== 0 && (
          <span
            className={cn(
              'rounded-pill inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-bold',
              // Not the success/danger tokens: this sits on solid blue, where a
              // dark green pill is unreadable and a red one reads as an error
              // banner rather than as a downward month.
              positive ? 'bg-primary-foreground/15 text-primary-100' : 'bg-danger text-danger-fg',
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3 rtl:-scale-x-100" aria-hidden />
            ) : (
              <ArrowDownRight className="h-3 w-3 rtl:-scale-x-100" aria-hidden />
            )}
            {formatPercent(Math.abs(month.delta), locale)}
          </span>
        )}
      </div>
      <p className="text-primary-300 mt-1 text-xs">
        {month.delta === null
          ? t('noBaselineThisFar')
          : month.partial
            ? t('vsSameStretch', {
                day: formatNumber(month.dayOfMonth, locale),
                amount: formatCurrency(month.previous, locale),
              })
            : t('vsLastMonth', { amount: formatCurrency(month.previous, locale) })}
      </p>

      {/*
        BOOKED VALUE, on its own line and clearly a different measure.
        Recognized income answers "what have we billed"; this answers "what is
        on the walls", and at the start of a month the second is the only one
        of the two with anything in it.
      */}
      {month.bookedThisMonth > 0 && (
        <p className="border-primary-foreground/15 mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t pt-3 text-sm">
          <span className="text-primary-200 text-xs">{t('bookedLabel')}</span>
          <span className="font-bold tabular-nums">
            {formatCurrency(month.bookedThisMonth, locale)}
          </span>
          <span className="text-primary-300 text-2xs">
            {t('bookedHint', {
              n: month.bookedCount,
              count: formatNumber(month.bookedCount, locale),
            })}
          </span>
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">
            {t('occupancy', {
              // `n` pluralises, `sold` and `total` render — see the dashboard queries.
              n: occupied,
              sold: formatNumber(occupied, locale),
              total: formatNumber(capacity, locale),
            })}
          </p>
          <p className="text-primary-300 text-xs tabular-nums">{formatPercent(fill, locale)}</p>
        </div>

        {/*
          A plain track and fill rather than a progress element: `<progress>`
          cannot be styled consistently across engines and, more to the point,
          this is not a task completing. `dir`-agnostic because the fill is a
          flex child, so it grows from the inline start in both scripts.
        */}
        <div
          className="bg-primary-foreground/15 rounded-pill mt-2 h-2 w-full overflow-hidden"
          role="img"
          aria-label={t('occupancy', {
            n: occupied,
            sold: formatNumber(occupied, locale),
            total: formatNumber(capacity, locale),
          })}
        >
          <div
            className="bg-primary-foreground/80 rounded-pill h-full"
            style={{ width: `${Math.round(fill * 100)}%` }}
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {top.length > 0 && (
        <div className="border-primary-foreground/15 mt-5 border-t pt-4">
          {/*
            THE LIST'S OWN PERIOD. These are lifetime slot totals and always
            were; without this line they sat under a month-to-date headline and
            read as its breakdown, which is how the card came to disagree with
            itself by a factor of nine hundred thousand.
          */}
          <p className="text-primary-300 mb-2 text-2xs font-semibold">
            {t('topSlotsLifetime', { total: formatCurrency(lifetimeTotal, locale) })}
          </p>
        <ul className="space-y-2">
          {top.map((slot, index) => (
            <li key={slot.id} className="flex items-baseline gap-3 text-sm">
              <span className="text-primary-300 w-4 shrink-0 text-center text-xs font-bold tabular-nums">
                {formatNumber(index + 1, locale)}
              </span>
              <span className="min-w-0 flex-1 truncate">{pickLocale(slot.name, locale)}</span>
              <span className="shrink-0 font-bold tabular-nums">
                {formatCurrency(slot.revenue, locale)}
              </span>
            </li>
          ))}
        </ul>
        </div>
      )}
    </section>
  );
}

export function RevenueBlockSkeleton() {
  return (
    <section className="rounded-card bg-primary-700 p-5 sm:p-6">
      <Skeleton className="bg-primary-foreground/20 h-4 w-32" />
      <Skeleton className="bg-primary-foreground/20 mt-4 h-9 w-48" />
      <Skeleton className="bg-primary-foreground/20 mt-2 h-3 w-40" />
      <Skeleton className="bg-primary-foreground/20 mt-6 h-2 w-full" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="bg-primary-foreground/20 h-4 w-full" />
        ))}
      </div>
    </section>
  );
}
