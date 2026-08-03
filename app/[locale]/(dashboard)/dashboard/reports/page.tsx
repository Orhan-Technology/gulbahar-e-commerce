import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart } from 'lucide-react';

import { RatingTrendChart } from '@/components/dashboard/reports/rating-trend-chart';
import { StatusDonut } from '@/components/dashboard/reports/status-donut';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopRatingTrend, topWishlisted } from '@/lib/db/queries/dashboard';
import {
  promotionPerformance,
  salesByProduct,
  salesSeries,
  statusBreakdown,
  type ReportPeriod,
} from '@/lib/db/queries/shop-reports';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { parseConsoleRange } from '@/lib/console-range';
import { ConsolePageHeader } from '@/components/console/page-header';
import { RangeControl } from '@/components/console/range-control';
import { ExportButton } from '@/components/dashboard/reports/export-button';
import { ReportTabs } from '@/components/dashboard/reports/report-tabs';
import { ResponsivenessReport } from '@/components/dashboard/reports/responsiveness-report';
import { StockReport } from '@/components/dashboard/reports/stock-report';
import {
  SummaryStrip,
  SummaryStripSkeleton,
  type SummaryCell,
} from '@/components/dashboard/reports/summary-strip';
import { TimingHeatmap } from '@/components/dashboard/reports/timing-heatmap';
import { ViewsWithoutSales } from '@/components/dashboard/reports/views-without-sales';
import { EXPORTABLE, parseShopReport, type ShopReportKey } from '@/lib/shop-reports';
import { Link } from '@/lib/i18n/navigation';


/**
 * Shop reporting (PRD §6.7, Prompt C10).
 *
 * FIVE REPORTS, EACH A URL. The overview is the sales line this page always
 * was; the other four are the ones that say what to FIX — what people look at
 * and do not buy, what is about to run out, how fast this shop answers compared
 * with the mall, and when somebody needs to be at the counter. Seller Central's
 * value was never its charts.
 *
 * Every one of them sits under a summary strip drawn from ONE helper —
 * `periodSummary` — so a shopkeeper reading "these forty products got eight
 * hundred views and no sales" has the shop's own conversion in the same
 * eyeline, computed the same way. Which cells that strip shows is per tab
 * (SUMMARY_CELLS below): the same five numbers on all five reports was a strip
 * nobody read, and on the overview it was one of TWO number systems on the
 * screen. There is now one.
 */
export default async function ShopReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string; report?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { range: rangeKey, report: reportKey } = await searchParams;
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopReports');

  /*
   * ONE range control across the console (Prompt C3). This page had its own
   * `?period=30` chips with their own markup — a second idiom for the same
   * decision, which is how two consoles end up looking like two products.
   */
  const range = parseConsoleRange(rangeKey);
  const period: ReportPeriod = range.days;
  const report = parseShopReport(reportKey);

  return (
    <div className="space-y-4 p-4">
      <ConsolePageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-2">
            {EXPORTABLE.includes(report) && <ExportButton report={report} range={range.key} />}
            <RangeControl current={range.key} />
          </div>
        }
      />

      <ReportTabs active={report} range={range.key} />

      {/*
        ONE SET OF NUMBERS, AND THE ONES THIS TAB IS READ AGAINST.
        The strip used to print the same five figures over all five reports —
        which taught a reader to skip it — and on the overview it sat directly
        above four StatCards computed from a SECOND query with a different money
        predicate, so the screen showed ؋۸۰۴٬۱۰۰ and ؋۶۰۷٬۷۰۰ for the same
        thirty days, neither of them labelled. The tiles are gone, the strip is
        the overview's numbers, and each tab asks for the cells its table needs.
      */}
      <Suspense
        key={`summary-${period}-${report}`}
        fallback={<SummaryStripSkeleton count={SUMMARY_CELLS[report].length} />}
      >
        <SummaryStrip shopId={user.shopId} period={period} cells={SUMMARY_CELLS[report]} />
      </Suspense>

      {report === 'overview' && (
        <>
          {/* Suspense per section, so a slow aggregate never blocks the
              headline numbers (PRD §10.5). A shop with nothing in the window is
              told so by the strip above, which is where the zeroes are — see
              summary-strip.tsx. */}
          <Suspense key={`sales-${period}`} fallback={<ChartSkeleton />}>
            <SalesSection shopId={user.shopId} period={period} />
          </Suspense>

          <div className="grid gap-4 lg:grid-cols-2">
            <Suspense key={`status-${period}`} fallback={<ChartSkeleton />}>
              <StatusSection shopId={user.shopId} period={period} />
            </Suspense>

            <Suspense key={`rating-${period}`} fallback={<ChartSkeleton />}>
              <RatingSection shopId={user.shopId} period={period} />
            </Suspense>

            <Suspense key={`products-${period}`} fallback={<ChartSkeleton />}>
              <TopProducts shopId={user.shopId} period={period} locale={locale} />
            </Suspense>

            <Suspense key={`promos-${period}`} fallback={<ChartSkeleton />}>
              <PromotionSection shopId={user.shopId} period={period} locale={locale} />
            </Suspense>

            <Suspense fallback={<ChartSkeleton />}>
              <WishlistSection shopId={user.shopId} locale={locale} />
            </Suspense>
          </div>
        </>
      )}

      {report === 'views' && (
        <Suspense key={`views-${period}`} fallback={<TableSkeleton />}>
          <ViewsWithoutSales shopId={user.shopId} period={period} />
        </Suspense>
      )}

      {report === 'stock' && (
        <Suspense key={`stock-${period}`} fallback={<TableSkeleton />}>
          <StockReport shopId={user.shopId} period={period} />
        </Suspense>
      )}

      {report === 'responsiveness' && (
        <Suspense key={`resp-${period}`} fallback={<ChartSkeleton />}>
          <ResponsivenessReport shopId={user.shopId} period={period} />
        </Suspense>
      )}

      {report === 'timing' && (
        <Suspense key={`timing-${period}`} fallback={<ChartSkeleton />}>
          <TimingHeatmap shopId={user.shopId} period={period} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * WHICH FIGURES EACH TAB IS READ AGAINST.
 *
 * Not a preference: every table below needs a shop-wide baseline in the same
 * eyeline, and it is a different baseline per table. The views report is read
 * against the shop's own views and conversion; the stock report against what
 * actually sold; the timing grid against how many orders the whole period
 * holds, which is the sample its verdict rests on. The responsiveness report
 * compares against the mall inside its own panel and needs no strip figures
 * beyond the volume behind them.
 */
const SUMMARY_CELLS: Record<ShopReportKey, SummaryCell[]> = {
  overview: ['revenue', 'orders', 'units', 'aov', 'conversion'],
  views: ['views', 'orders', 'conversion'],
  stock: ['units', 'orders'],
  responsiveness: ['orders', 'units'],
  timing: ['orders', 'units'],
};

async function SalesSection({ shopId, period }: { shopId: string; period: ReportPeriod }) {
  const t = await getTranslations('shopReports');
  const series = await salesSeries(shopId, period);

  return (
    <Panel title={t('salesHeading')}>
      <SalesChart data={series} />
    </Panel>
  );
}

async function StatusSection({ shopId, period }: { shopId: string; period: ReportPeriod }) {
  const t = await getTranslations('shopReports');
  const data = await statusBreakdown(shopId, period);

  return (
    <Panel title={t('statusHeading')}>
      <StatusDonut data={data} />
    </Panel>
  );
}

async function RatingSection({ shopId, period }: { shopId: string; period: ReportPeriod }) {
  const t = await getTranslations('shopReports');
  const trend = await shopRatingTrend(shopId, period);

  return (
    <Panel title={t('ratingHeading')}>
      <RatingTrendChart data={trend} />
    </Panel>
  );
}

async function TopProducts({
  shopId,
  period,
  locale,
}: {
  shopId: string;
  period: ReportPeriod;
  locale: string;
}) {
  const t = await getTranslations('shopReports');
  const rows = await salesByProduct(shopId, period);
  const top = rows[0]?.revenue ?? 0;

  return (
    <Panel title={t('productsHeading')}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t('noOrders')}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="clamp-1">{pickLocale(row.title, locale)}</span>
                <span className="shrink-0 font-medium">{formatCurrency(row.revenue, locale)}</span>
              </div>
              {/* A bar rather than a chart: it is a ranked list, and the bar only has
                  to show relative size. Grows from the inline start, so it fills
                  right-to-left in Dari. */}
              <div className="rounded-pill h-1.5 w-full overflow-hidden bg-neutral-100">
                <div
                  className="bg-primary-400 rounded-pill h-full"
                  style={{ width: `${top > 0 ? Math.round((row.revenue / top) * 100) : 0}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t('unitsSold', { count: formatNumber(row.units, locale) })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function PromotionSection({
  shopId,
  period,
  locale,
}: {
  shopId: string;
  period: ReportPeriod;
  locale: string;
}) {
  const t = await getTranslations('shopReports');
  const rows = await promotionPerformance(shopId, period);

  return (
    <Panel title={t('promotionsHeading')}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t('noPromotions')}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={pickLocale(row.slotName, locale)} className="space-y-1 py-2 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm">{pickLocale(row.slotName, locale)}</span>
                <span className="text-xs font-medium">{formatCurrency(row.spend, locale)}</span>
              </div>
              <p className="text-muted-foreground text-xs">
                {t('impressionsClicks', {
                  impressions: formatNumber(row.impressions, locale),
                  clicks: formatNumber(row.clicks, locale),
                  ctr: formatPercent(
                    row.impressions > 0 ? row.clicks / row.impressions : 0,
                    locale,
                  ),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function WishlistSection({ shopId, locale }: { shopId: string; locale: string }) {
  const t = await getTranslations('shopReports');
  const rows = await topWishlisted(shopId);

  return (
    <Panel title={t('wishlistHeading')}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t('noWishlist')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/products/${row.slug}`} className="hover:text-primary clamp-1">
                {pickLocale(row.title, locale)}
              </Link>
              <Badge variant="secondary">
                <Heart className="h-3 w-3" aria-hidden />
                {formatNumber(row.saves, locale)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-card border-border bg-card space-y-2 border p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-40 w-full" />
    </section>
  );
}
