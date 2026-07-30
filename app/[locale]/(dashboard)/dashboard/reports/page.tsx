import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart, Receipt, ShoppingBag, Wallet } from 'lucide-react';

import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
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
  salesTotals,
  statusBreakdown,
  type ReportPeriod,
} from '@/lib/db/queries/shop-reports';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { parseConsoleRange } from '@/lib/console-range';
import { ConsolePageHeader } from '@/components/console/page-header';
import { RangeControl } from '@/components/console/range-control';
import { Link } from '@/lib/i18n/navigation';


/** Shop reporting (PRD §6.7). */
export default async function ShopReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { range: rangeKey } = await searchParams;
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopReports');

  /*
   * ONE range control across the console (Prompt C3). This page had its own
   * `?period=30` chips with their own markup — a second idiom for the same
   * decision, which is how two consoles end up looking like two products.
   */
  const range = parseConsoleRange(rangeKey);
  const period: ReportPeriod = range.days;

  return (
    <div className="space-y-4 p-4">
      <ConsolePageHeader title={t('title')} actions={<RangeControl current={range.key} />} />

      {/* Suspense per section, so a slow aggregate never blocks the headline
          numbers (PRD §10.5). */}
      <Suspense key={`totals-${period}`} fallback={<TotalsSkeleton />}>
        <Totals shopId={user.shopId} period={period} />
      </Suspense>

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
    </div>
  );
}

async function Totals({ shopId, period }: { shopId: string; period: ReportPeriod }) {
  const t = await getTranslations('shopReports');
  const totals = await salesTotals(shopId, period);

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={t('revenue')}
        value={totals.revenue}
        format="currency"
        icon={<Wallet className="h-4 w-4" />}
      />
      <StatCard
        label={t('orders')}
        value={totals.orderCount}
        icon={<ShoppingBag className="h-4 w-4" />}
      />
      <StatCard
        label={t('aov')}
        value={totals.averageOrderValue}
        format="currency"
        icon={<Receipt className="h-4 w-4" />}
      />
      <StatCard label={t('units')} value={totals.itemCount} />
    </dl>
  );
}

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

function TotalsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <StatCardSkeleton key={index} />
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
