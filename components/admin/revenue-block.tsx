import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { revenueBySlot, revenueMonthToDate } from '@/lib/db/queries/admin-revenue';
import { formatCurrency, formatMonth, formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { localeMonthBounds } from '@/lib/locale-month';
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
 *
 * AND THE MONTH IS NOW THE READER'S MONTH. All three of those repairs were
 * made on top of a Gregorian `date_trunc('month', now())` while every label
 * around them said «اسد» — so "this month" began on 1 August under a heading
 * naming a solar month that began on 23 July, and the tile was measuring a
 * fortnight the chart beside it was not. lib/locale-month.ts owns the boundary
 * for the booking calendar already; the money uses the same one now, and the
 * card NAMES the period rather than leaving "this month" to be interpreted.
 */
export async function RevenueBlock() {
  const locale = await getLocale();
  const t = await getTranslations('adminOverview.revenue');

  // One clock read, on the server, shared by the bounds and both queries.
  const month = localeMonthBounds(locale, new Date());
  const [figures, slots] = await Promise.all([
    revenueMonthToDate(month),
    revenueBySlot({ start: month.start, end: month.end }),
  ]);

  const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const occupied = slots.reduce((sum, slot) => sum + slot.occupied, 0);
  // Clamped: an oversold slot would otherwise draw a bar past its track.
  const fill = capacity > 0 ? Math.min(occupied / capacity, 1) : 0;

  const top = [...slots]
    .filter((slot) => slot.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);
  const lifetimeTotal = slots.reduce((sum, slot) => sum + slot.revenue, 0);

  const positive = (figures.delta ?? 0) >= 0;

  /*
   * THE OPENING DAYS OF A MONTH ARE NOT A COLLAPSE.
   *
   * A weekly placement fee is invoiced up front (PRD §8.3), so on the 2nd of a
   * month almost nothing has been RECOGNISED even when the walls are full — and
   * a bare «۰ ؋» under a red ↓۱۰۰٪ badge is the console telling its owner their
   * advertising business died. Both figures are true; only the pair is honest.
   * So when nothing has been billed yet and there IS placement running, the
   * card leads with the booked value and the red badge is withheld: there is no
   * meaningful percentage to draw between zero and a month that has not
   * started billing.
   */
  const billingNotStarted = figures.current === 0 && figures.bookedThisMonth > 0;
  const showDelta = !billingNotStarted && figures.delta !== null && figures.delta !== 0;
  const monthName = formatMonth(month.start, locale);

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

      {/*
        THE PERIOD, NAMED — «از ۱ اسد تا امروز» — rather than "this month",
        which on a Gregorian basis under a solar heading meant two different
        fortnights depending on which line you read.
      */}
      <p className="text-primary-300 mt-3 text-2xs font-semibold" data-money-period>
        {month.partial
          ? t('sinceMonthStart', {
              month: monthName,
              day: formatNumber(month.dayOfMonth, locale),
            })
          : t('wholeMonth', { month: monthName })}
      </p>

      {/*
        RECOGNISED BESIDE BOOKED, always — two figures of the same month, never
        one of them alone. The larger type goes to whichever one the reader
        should act on: billed money once billing has started, booked value in
        the days before it has.
      */}
      <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-primary-200 text-2xs">{t('recognisedShort')}</p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <p
              className={cn(
                'leading-none font-extrabold tabular-nums',
                billingNotStarted ? 'text-xl' : 'text-3xl',
              )}
              data-recognised
            >
              {formatCurrency(figures.current, locale)}
            </p>
            {showDelta && (
              <span
                className={cn(
                  'rounded-pill inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-bold',
                  // Not the success/danger tokens: this sits on solid blue, where a
                  // dark green pill is unreadable and a red one reads as an error
                  // banner rather than as a downward month.
                  positive
                    ? 'bg-primary-foreground/15 text-primary-100'
                    : 'bg-danger text-danger-fg',
                )}
              >
                {positive ? (
                  <ArrowUpRight className="h-3 w-3 rtl:-scale-x-100" aria-hidden />
                ) : (
                  <ArrowDownRight className="h-3 w-3 rtl:-scale-x-100" aria-hidden />
                )}
                {formatPercent(Math.abs(figures.delta!), locale)}
              </span>
            )}
          </div>
        </div>

        {figures.bookedThisMonth > 0 && (
          <div className="border-primary-foreground/20 border-s ps-6">
            <p className="text-primary-200 text-2xs">{t('bookedLabel')}</p>
            <p
              className={cn(
                'mt-0.5 leading-none font-extrabold tabular-nums',
                billingNotStarted ? 'text-3xl' : 'text-xl',
              )}
              data-booked
            >
              {formatCurrency(figures.bookedThisMonth, locale)}
            </p>
          </div>
        )}
      </div>

      <p className="text-primary-300 mt-2 text-xs">
        {billingNotStarted
          ? t('billingNotStarted', {
              n: figures.bookedCount,
              count: formatNumber(figures.bookedCount, locale),
              month: monthName,
            })
          : figures.delta === null
            ? t('noBaselineThisFar')
            : month.partial
              ? t('vsSameStretch', {
                  day: formatNumber(month.dayOfMonth, locale),
                  amount: formatCurrency(figures.previous, locale),
                })
              : t('vsLastMonth', { amount: formatCurrency(figures.previous, locale) })}
      </p>

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
