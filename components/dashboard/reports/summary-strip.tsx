import { getLocale, getTranslations } from 'next-intl/server';

import { periodSummary, type ReportPeriod } from '@/lib/db/queries/shop-reports';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The period summary, above every report (Prompt C10).
 *
 * ONE STRIP, ON EVERY TAB, so a shopkeeper reading "these forty products got
 * eight hundred views and no sales" has the shop's own conversion in the same
 * eyeline. A number is only actionable next to the number it should be compared
 * with.
 *
 * NOT StatCards. Those carry deltas and drill-downs and belong on the overview
 * where a tile is the subject; here the strip is context for the table below
 * it, and five cards would out-weigh the report they introduce.
 *
 * Every figure comes from `periodSummary`, which reads the same view and order
 * definitions the tables do — the requirement C10 states, and one that is only
 * keepable because there is a single place to read them from.
 */
export async function SummaryStrip({
  shopId,
  period,
}: {
  shopId: string;
  period: ReportPeriod;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopReports.summary');
  const summary = await periodSummary(shopId, period);

  const cells = [
    { key: 'revenue', value: formatCurrency(summary.revenue, locale) },
    { key: 'orders', value: formatNumber(summary.orderCount, locale) },
    { key: 'units', value: formatNumber(summary.units, locale) },
    { key: 'aov', value: formatCurrency(summary.averageOrderValue, locale) },
    {
      key: 'conversion',
      // Two decimals: see formatPercent. A storefront's conversion is
      // well under one percent and rounds to "0%" otherwise.
      value: summary.views > 0 ? formatPercent(summary.conversion, locale, 2) : '—',
    },
  ] as const;

  return (
    <dl
      data-summary-strip
      className="rounded-card border-border bg-card grid grid-cols-2 divide-x divide-y divide-border border sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0 rtl:divide-x-reverse"
    >
      {cells.map((cell) => (
        <div key={cell.key} className="px-4 py-3">
          <dt className="text-muted-foreground text-xs">{t(cell.key)}</dt>
          <dd className="text-base font-bold tabular-nums">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SummaryStripSkeleton() {
  return (
    <div className="rounded-card border-border bg-card grid grid-cols-2 gap-px border sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="space-y-2 px-4 py-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}
