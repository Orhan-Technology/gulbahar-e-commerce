import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Receipt, ShoppingBag, Store, Users, Wallet } from 'lucide-react';

import { StatusDonut } from '@/components/dashboard/reports/status-donut';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import {
  activeShopCount,
  platformSeries,
  platformStatusMix,
  platformTotals,
  topCategories,
  topShops,
  type PlatformPeriod,
} from '@/lib/db/queries/admin-reports';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

const PERIODS: PlatformPeriod[] = [7, 30, 90];

/** Platform reporting (PRD §7.4). */
export default async function AdminReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { period: rawPeriod } = await searchParams;
  await requireAdmin(locale);
  const t = await getTranslations('adminReports');

  const period: PlatformPeriod = PERIODS.includes(Number(rawPeriod) as PlatformPeriod)
    ? (Number(rawPeriod) as PlatformPeriod)
    : 30;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">{t('title')}</h1>
          <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((option) => (
            <Link
              key={option}
              href={`/admin/reports?period=${option}`}
              className={`rounded-pill border px-3 py-1.5 text-xs font-medium ${
                option === period
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-border bg-card hover:border-primary'
              }`}
            >
              {t('days', { count: formatNumber(option, locale) })}
            </Link>
          ))}
        </div>
      </div>

      <Suspense key={`totals-${period}`} fallback={<TotalsSkeleton />}>
        <Totals period={period} locale={locale} />
      </Suspense>

      <Suspense key={`series-${period}`} fallback={<PanelSkeleton />}>
        <Series period={period} />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-3">
        <Suspense key={`status-${period}`} fallback={<PanelSkeleton />}>
          <StatusMix period={period} />
        </Suspense>
        <Suspense key={`shops-${period}`} fallback={<PanelSkeleton />}>
          <TopShops period={period} locale={locale} />
        </Suspense>
        <Suspense key={`categories-${period}`} fallback={<PanelSkeleton />}>
          <TopCategories period={period} locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}

async function Totals({ period, locale }: { period: PlatformPeriod; locale: string }) {
  const t = await getTranslations('adminReports');
  const [totals, shops] = await Promise.all([platformTotals(period), activeShopCount(period)]);

  const rejectionRate =
    totals.orderCount + totals.rejectedCount > 0
      ? totals.rejectedCount / (totals.orderCount + totals.rejectedCount)
      : 0;

  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={t('gmv')}
          value={totals.gmv}
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
        <StatCard label={t('buyers')} value={totals.buyers} icon={<Users className="h-4 w-4" />} />
        <StatCard
          label={t('tradingShops')}
          value={shops.trading}
          icon={<Store className="h-4 w-4" />}
        />
      </dl>

      {/* A rejection rate is exactly what platform reporting exists to surface. */}
      <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span>{t('approvedShops', { count: formatNumber(shops.approved, locale) })}</span>
        <Badge variant={rejectionRate > 0.1 ? 'warning' : 'secondary'}>
          {t('rejectionRate', { value: formatPercent(rejectionRate, locale) })}
        </Badge>
        <span>{t('gmvNote')}</span>
      </p>
    </>
  );
}

async function Series({ period }: { period: PlatformPeriod }) {
  const t = await getTranslations('adminReports');
  const series = await platformSeries(period);

  return (
    <Panel title={t('seriesHeading')}>
      <SalesChart data={series} />
    </Panel>
  );
}

async function StatusMix({ period }: { period: PlatformPeriod }) {
  const t = await getTranslations('adminReports');
  const data = await platformStatusMix(period);

  return (
    <Panel title={t('statusHeading')}>
      <StatusDonut data={data} />
    </Panel>
  );
}

async function TopShops({ period, locale }: { period: PlatformPeriod; locale: string }) {
  const t = await getTranslations('adminReports');
  const rows = await topShops(period);
  const top = rows[0]?.revenue ?? 0;

  return (
    <Panel title={t('topShopsHeading')}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t('noData')}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((shop) => (
            <li key={shop.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <Link href={`/admin/shops/${shop.id}`} className="hover:text-primary clamp-1">
                  {pickLocale(shop.name, locale)}
                </Link>
                <span className="shrink-0 font-medium">{formatCurrency(shop.revenue, locale)}</span>
              </div>
              <div className="rounded-pill h-1.5 w-full overflow-hidden bg-neutral-100">
                <div
                  className="bg-primary-400 rounded-pill h-full"
                  style={{ width: `${top > 0 ? Math.round((shop.revenue / top) * 100) : 0}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t('orderCount', { count: formatNumber(shop.orderCount, locale) })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function TopCategories({ period, locale }: { period: PlatformPeriod; locale: string }) {
  const t = await getTranslations('adminReports');
  const rows = await topCategories(period);
  const top = rows[0]?.revenue ?? 0;

  return (
    <Panel title={t('topCategoriesHeading')}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t('noData')}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((category) => (
            <li key={category.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="clamp-1">{pickLocale(category.name, locale)}</span>
                <span className="shrink-0 font-medium">
                  {formatCurrency(category.revenue, locale)}
                </span>
              </div>
              <div className="rounded-pill h-1.5 w-full overflow-hidden bg-neutral-100">
                <div
                  className="bg-accent-400 rounded-pill h-full"
                  style={{ width: `${top > 0 ? Math.round((category.revenue / top) * 100) : 0}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t('units', { count: formatNumber(category.units, locale) })}
              </p>
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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-40 w-full" />
    </section>
  );
}
