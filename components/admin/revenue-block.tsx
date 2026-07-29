import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { promotionRevenueMonths } from '@/lib/db/queries/admin-overview';
import { revenueBySlot } from '@/lib/db/queries/admin-revenue';
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
 */
export async function RevenueBlock() {
  const locale = await getLocale();
  const t = await getTranslations('adminOverview.revenue');

  const [months, slots] = await Promise.all([promotionRevenueMonths(), revenueBySlot()]);

  const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const occupied = slots.reduce((sum, slot) => sum + slot.occupied, 0);
  // Clamped: an oversold slot would otherwise draw a bar past its track.
  const fill = capacity > 0 ? Math.min(occupied / capacity, 1) : 0;

  const top = [...slots]
    .filter((slot) => slot.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const positive = (months.delta ?? 0) >= 0;

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

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <p className="text-3xl leading-none font-extrabold tabular-nums">
          {formatCurrency(months.thisMonth, locale)}
        </p>
        {months.delta !== null && months.delta !== 0 && (
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
            {formatPercent(Math.abs(months.delta), locale)}
          </span>
        )}
      </div>
      <p className="text-primary-300 mt-1 text-xs">
        {months.lastMonth > 0
          ? t('vsLastMonth', { amount: formatCurrency(months.lastMonth, locale) })
          : t('firstMonth')}
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
        <ul className="border-primary-foreground/15 mt-5 space-y-2 border-t pt-4">
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
