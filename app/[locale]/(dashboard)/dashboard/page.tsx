import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { Eye, Heart, Package, ShoppingCart, Wallet } from 'lucide-react';

import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { ActionQueue } from '@/components/dashboard/action-queue';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { actionQueueItems, shopDashboardStats } from '@/lib/db/queries/dashboard';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Shop dashboard home — quality-bar screen #3 (PRD §6.1, §10.8).
 *
 * Answers two questions in three seconds: did I make money, and what needs my
 * attention. The stat row answers the first; the action queue answers the second
 * and gets the most vertical space on a phone because of it.
 */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('dashboard');

  return (
    <div className="space-y-6 p-4">
      <Suspense fallback={<StatRowSkeleton />}>
        <StatRow shopId={user.shopId} />
      </Suspense>

      {/* The centrepiece comes before the chart on mobile: a shopkeeper opening
          this behind the counter needs the to-do list, not the trend. */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">{t('queue.heading')}</h2>
        <Suspense fallback={<QueueSkeleton />}>
          <QueueSection shopId={user.shopId} locale={locale} />
        </Suspense>
      </section>

      <Suspense fallback={<ChartSkeleton />}>
        <ChartSection shopId={user.shopId} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <TopProducts shopId={user.shopId} locale={locale} />
      </Suspense>
    </div>
  );
}

async function StatRow({ shopId }: { shopId: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={t('todaySales')}
        value={stats.todaySales}
        format="currency"
        icon={<Wallet className="h-4 w-4" />}
      />
      <StatCard
        label={t('weekSales')}
        value={stats.weekSales}
        format="currency"
        icon={<Wallet className="h-4 w-4" />}
      />
      <StatCard
        label={t('ordersAwaiting')}
        value={stats.ordersAwaitingAction}
        icon={<ShoppingCart className="h-4 w-4" />}
      />
      <StatCard
        label={t('liveProducts')}
        value={stats.liveProducts}
        icon={<Package className="h-4 w-4" />}
      />
    </div>
  );
}

async function QueueSection({ shopId, locale }: { shopId: string; locale: string }) {
  const entries = await actionQueueItems(shopId, locale);
  return <ActionQueue entries={entries} />;
}

async function ChartSection({ shopId }: { shopId: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div>
        <h2 className="text-base font-bold">{t('salesChartHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('salesChartHint')}</p>
      </div>
      <SalesChart data={stats.salesSeries} />
    </section>
  );
}

async function TopProducts({ shopId, locale }: { shopId: string; locale: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  if (stats.topProducts.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold">{t('topProductsHeading')}</h2>

      {/* A table on desktop, stacked rows on a phone — a four-column table at
          390px is unreadable however it is styled. */}
      <ul className="rounded-card border-border bg-card space-y-2 border p-2">
        {stats.topProducts.map((product) => (
          <li key={product.id}>
            <Link
              href={`/dashboard/products?q=${encodeURIComponent(product.slug)}`}
              className="rounded-control flex items-center gap-3 p-2 transition-colors duration-150 hover:bg-neutral-50"
            >
              <span className="rounded-control relative h-12 w-12 shrink-0 overflow-hidden bg-neutral-100">
                {product.imagePath && (
                  <Image
                    src={product.imagePath}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="clamp-1 text-sm font-medium">
                  {pickLocale(product.title as never, locale)}
                </span>
                <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" aria-hidden />
                    {formatNumber(product.viewCount, locale)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" aria-hidden />
                    {formatNumber(product.orderCount, locale)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3 w-3" aria-hidden />
                    {formatNumber(product.wishlistCount, locale)}
                  </span>
                </span>
              </span>

              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {formatCurrency(product.revenue, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <li
          key={index}
          className="rounded-card border-border bg-card flex items-center gap-3 border p-3"
        >
          <Skeleton className="rounded-control h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChartSkeleton() {
  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-64 w-full" />
    </section>
  );
}

function TableSkeleton() {
  return (
    <section className="space-y-3">
      <Skeleton className="h-5 w-32" />
      <div className="rounded-card border-border bg-card space-y-2 border p-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 p-2">
            <Skeleton className="rounded-control h-12 w-12 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
