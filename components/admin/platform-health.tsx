import { getLocale, getTranslations } from 'next-intl/server';
import { ShoppingBag, Store, UserPlus } from 'lucide-react';

import { ChartScaleNote } from '@/components/admin/chart-scale-note';
import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { newCustomers } from '@/lib/db/queries/admin-overview';
import type { ConsoleRange } from '@/lib/console-range';
import { platformSeries, platformTotals, topShops } from '@/lib/db/queries/admin-reports';
import { shopCountsByStatus } from '@/lib/db/queries/shops';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * How the marketplace is doing, last 30 days (PRD §7.4).
 *
 * Third on the page, under the queue and the money, because it is the only
 * section nobody has to act on. Three tiles and a chart, then the leaderboard —
 * no tables, which live on the section pages (PRD §7.4).
 *
 * The GMV chart reuses the shopkeeper's `SalesChart` rather than a second line
 * component. It is the same thing measured at a different scale, and two chart
 * idioms in one product is exactly the drift D5 exists to catch.
 */
const WINDOW_DAYS = 30 as const;

/**
 * Platform health for the selected window (Prompt C3).
 *
 * Every figure here obeys the console's date range, including the deltas — the
 * comparison period is the equally-long stretch before it, derived in
 * lib/console-range.ts rather than configured separately.
 */
export async function PlatformHealth({ range }: { range?: ConsoleRange }) {
  const locale = await getLocale();
  const t = await getTranslations('adminOverview.health');
  const days = range?.days ?? WINDOW_DAYS;

  const [totals, series, customers, shopCounts, leaders] = await Promise.all([
    platformTotals(days),
    platformSeries(days),
    newCustomers(days),
    shopCountsByStatus(),
    topShops(days, 5),
  ]);

  const totalShops = Object.values(shopCounts).reduce((sum, value) => sum + value, 0);
  const gmvTotal = series.reduce((sum, point) => sum + point.revenue, 0);

  // Orders per day, not orders total: the total is already the chart's own
  // subject, and a rate is what tells a manager whether the mall is busy.
  const perDay = totals.orderCount / days;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold">{t('heading')}</h2>

      {/* Three per row below `xl`; stacked in the rail above it, where the
          column is 23rem wide and three tiles across would truncate. */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <StatCard
          label={t('ordersPerDay')}
          value={Math.round(perDay * 10) / 10}
          format="decimal"
          icon={<ShoppingBag className="h-4 w-4" aria-hidden />}
          href="/admin/orders"
          hint={t('ordersTotal', {
            n: totals.orderCount,
            count: formatNumber(totals.orderCount, locale),
          })}
        />
        <StatCard
          label={t('activeShops')}
          value={shopCounts.approved ?? 0}
          icon={<Store className="h-4 w-4" aria-hidden />}
          href="/admin/shops?status=approved"
          hint={t('ofTotalShops', { total: formatNumber(totalShops, locale) })}
        />
        <StatCard
          label={t('newCustomers')}
          value={customers.current}
          icon={<UserPlus className="h-4 w-4" aria-hidden />}
          href="/admin/users?role=customer"
          delta={customers.delta}
          // "vs previous period" with no percentage beside it promises a
          // comparison that was never made (Prompt C2). With no baseline the
          // card states the window instead.
          hint={customers.delta !== null ? t('vsPrevious') : t('noBaseline')}
          hintTone={(customers.delta ?? 0) >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="rounded-card border-border bg-card space-y-3 border p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-bold">{t('gmvHeading')}</h3>
          <p className="text-sm font-semibold text-neutral-600 tabular-nums">
            {formatCurrency(gmvTotal, locale)}
          </p>
          <p className="ms-auto text-xs text-neutral-500">{t('gmvHint')}</p>
        </div>
        <SalesChart data={series} />
        {/* The line has no Y axis by design; this is what makes it citable. */}
        <ChartScaleNote data={series} />
      </div>

      {leaders.length > 0 && (
        <div className="rounded-card border-border bg-card space-y-1 border p-4">
          <h3 className="mb-2 text-sm font-bold">{t('leaderboardHeading')}</h3>
          <ul>
            {leaders.map((shop, index) => (
              <li key={shop.id}>
                <Link
                  href={`/admin/shops/${shop.id}`}
                  className={cn(
                    pressable,
                    'rounded-control flex items-center gap-3 p-2 transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-50',
                  )}
                >
                  <span className="w-4 shrink-0 text-center text-xs font-bold text-neutral-400 tabular-nums">
                    {formatNumber(index + 1, locale)}
                  </span>
                  <span
                    className="rounded-control bg-primary-50 text-primary flex h-9 w-9 shrink-0 items-center justify-center text-sm font-bold"
                    aria-hidden
                  >
                    {pickLocale(shop.name, locale).trim().charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="clamp-1 text-sm font-medium">
                      {pickLocale(shop.name, locale)}
                    </span>
                    <span className="text-2xs mt-0.5 block text-neutral-500">
                      {t('leaderboardOrders', {
                        n: shop.orderCount,
                        count: formatNumber(shop.orderCount, locale),
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatCurrency(shop.revenue, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function PlatformHealthSkeleton() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-4 w-32" />
      {/*
        THE SAME GRID AS THE REAL THING. The skeleton laid three tiles across at
        every width while the loaded section stacks them from `xl` — so at 1440,
        where this section lives in a 23rem rail, the placeholder overflowed its
        own column and then snapped into a single file when the data arrived.
        A skeleton whose shape disagrees with its content is a layout shift with
        extra steps.
      */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        {Array.from({ length: 3 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="rounded-card border-border bg-card space-y-3 border p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-56 w-full" />
      </div>
      <div className="rounded-card border-border bg-card space-y-2 border p-4">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 p-2">
            <Skeleton className="h-3 w-4 shrink-0" />
            <Skeleton className="rounded-control h-9 w-9 shrink-0" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </section>
  );
}
