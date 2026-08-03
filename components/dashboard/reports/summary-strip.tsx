import { getLocale, getTranslations } from 'next-intl/server';

import { periodSummary, type ReportPeriod } from '@/lib/db/queries/shop-reports';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The period summary, above every report (Prompt C10).
 *
 * ONE SET OF NUMBERS FOR THE WHOLE SCREEN. The overview used to carry this
 * strip AND four StatCards computed from a second query with a different money
 * predicate, so it showed two different thirty-day sales figures, one above the
 * other, neither of them labelled. The strip won because it is context sized
 * like context; the tiles read as the subject of the page, which the charts
 * below them already are.
 *
 * WHICH CELLS depends on the tab, and that is the second thing that changed.
 * The identical five numbers repeated over all five reports taught a reader to
 * skip the strip — on the views report the useful baseline is the shop's own
 * views and conversion, on stock it is what actually sold. Same query, same
 * definitions, fewer numbers, each one the one its table should be read
 * against.
 *
 * THE BASIS IS PRINTED, not implied: money and units count fulfilled orders,
 * the order count counts everything the shop did not reject or cancel. Those
 * two predicates genuinely differ (see the note in queries/shop-reports.ts) and
 * a shopkeeper comparing this strip with the takings in the till is entitled to
 * know which is which.
 */
export type SummaryCell = 'revenue' | 'orders' | 'units' | 'aov' | 'conversion' | 'views';

const OVERVIEW_CELLS: SummaryCell[] = ['revenue', 'orders', 'units', 'aov', 'conversion'];

/** Four or more cells need the 5-across breakpoint; 2–3 stay side by side. */
function columns(count: number) {
  return count >= 4
    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
    : count === 3
      ? 'grid-cols-3'
      : 'grid-cols-2';
}

export async function SummaryStrip({
  shopId,
  period,
  cells = OVERVIEW_CELLS,
}: {
  shopId: string;
  period: ReportPeriod;
  cells?: SummaryCell[];
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopReports.summary');
  const summary = await periodSummary(shopId, period);

  const values: Record<SummaryCell, string> = {
    revenue: formatCurrency(summary.revenue, locale),
    orders: formatNumber(summary.orderCount, locale),
    units: formatNumber(summary.units, locale),
    aov: formatCurrency(summary.averageOrderValue, locale),
    // Two decimals: see formatPercent. A storefront's conversion is
    // well under one percent and rounds to "0%" otherwise.
    conversion: summary.views > 0 ? formatPercent(summary.conversion, locale, 2) : '—',
    views: formatNumber(summary.views, locale),
  };

  const showsMoney = cells.some((cell) => cell === 'revenue' || cell === 'aov' || cell === 'units');

  return (
    <div data-summary-strip className="space-y-1.5">
      <dl
        className={cn(
          'rounded-card border-border bg-card divide-border grid divide-x divide-y border rtl:divide-x-reverse',
          columns(cells.length),
          cells.length >= 4 && 'lg:divide-y-0',
        )}
      >
        {cells.map((cell) => (
          <div key={cell} className="px-4 py-3">
            <dt className="text-muted-foreground text-xs">{t(cell)}</dt>
            <dd className="text-base font-bold tabular-nums">{values[cell]}</dd>
          </div>
        ))}
      </dl>

      {/*
        A window with nothing in it is EXPLAINED rather than left as a row of
        zeroes (Prompt C5) — five ؋ ۰ cells read as a broken screen to someone
        who has not had a sale yet. Otherwise: the sentence that stops this
        strip disagreeing with the till, and only where money is on screen —
        a views-and-orders strip has nothing to qualify.
      */}
      {summary.orderCount === 0 ? (
        <p className="text-2xs text-neutral-500">{t('empty')}</p>
      ) : (
        showsMoney && <p className="text-2xs text-neutral-500">{t('basis')}</p>
      )}
    </div>
  );
}

export function SummaryStripSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1.5">
      <div className={cn('rounded-card border-border bg-card grid gap-px border', columns(count))}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="space-y-2 px-4 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-56" />
    </div>
  );
}
