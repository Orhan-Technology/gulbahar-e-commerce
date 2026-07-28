import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';

import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { ActionQueue } from '@/components/dashboard/action-queue';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { actionQueueItems, shopDashboardStats } from '@/lib/db/queries/dashboard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Shop dashboard home — quality-bar screen #3 (PRD §6.1, §10.8).
 *
 * Answers two questions in three seconds: did I make money, and what needs my
 * attention. The stat row answers the first; the action queue answers the second
 * and gets the most vertical space on a phone because of it.
 *
 * Every tile carries a hint line under its figure, because a number on its own
 * is not yet information: "142" means nothing, "142 live, 4 low on stock" is
 * something a shopkeeper acts on.
 */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Suspense fallback={<StatRowSkeleton />}>
        <StatRow shopId={user.shopId} locale={locale} />
      </Suspense>

      {/* The centrepiece comes before the chart on mobile: a shopkeeper opening
          this behind the counter needs the to-do list, not the trend. */}
      <Suspense fallback={<QueueSkeleton />}>
        <QueueSection shopId={user.shopId} locale={locale} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <ChartSection shopId={user.shopId} locale={locale} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <TopProducts shopId={user.shopId} locale={locale} />
      </Suspense>
    </div>
  );
}

async function StatRow({ shopId, locale }: { shopId: string; locale: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={t('todaySales')}
        value={stats.todaySales}
        format="currency"
        tone="primary"
        /*
         * A day with no takings YET is not a 100% collapse — it is a day that
         * has not finished. Showing the drop would put a red alarm on the lead
         * tile of every shop every morning, so the comparison waits until
         * there is something to compare.
         */
        delta={stats.todaySales > 0 ? stats.todayDelta : null}
        hint={
          stats.todaySales === 0
            ? t('noSalesYet')
            : stats.todayDelta !== null
              ? t('vsYesterday')
              : undefined
        }
        hintTone={(stats.todayDelta ?? 0) >= 0 ? 'success' : 'danger'}
      />
      <StatCard
        label={t('weekSales')}
        value={stats.weekSales}
        format="currency"
        /*
         * Two arguments for one number: `n` is the raw value ICU pluralises on,
         * `count` is the Persian-digit rendering that goes in the sentence.
         * `#` cannot do both — it formats with the message locale ('fa'), not
         * the Afghan tag our numerals come from, and would print 31 in a Dari
         * string reading «۳۱ سفارش» everywhere else.
         */
        hint={t('weekOrders', {
          n: stats.weekOrderCount,
          count: formatNumber(stats.weekOrderCount, locale),
        })}
      />
      <StatCard
        label={t('ordersAwaiting')}
        value={stats.ordersAwaitingAction}
        tone={stats.ordersAwaitingAction > 0 ? 'danger' : 'ink'}
        hint={
          stats.actionQueue.newOrders > 0
            ? t('newOrdersHint', {
                n: stats.actionQueue.newOrders,
                count: formatNumber(stats.actionQueue.newOrders, locale),
              })
            : t('queueClear')
        }
      />
      <StatCard
        label={t('liveProducts')}
        value={stats.liveProducts}
        hint={
          stats.lowStockProducts > 0
            ? t('lowStockHint', { count: formatNumber(stats.lowStockProducts, locale) })
            : t('allInStock')
        }
        hintTone={stats.lowStockProducts > 0 ? 'warning' : 'muted'}
      />
    </div>
  );
}

async function QueueSection({ shopId, locale }: { shopId: string; locale: string }) {
  const entries = await actionQueueItems(shopId, locale);
  return <ActionQueue entries={entries} />;
}

async function ChartSection({ shopId, locale }: { shopId: string; locale: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  const total = stats.salesSeries.reduce((sum, point) => sum + point.revenue, 0);
  const first = stats.salesSeries.at(0);
  const last = stats.salesSeries.at(-1);

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold">{t('salesChartHeading')}</h2>
        <p className="text-sm font-semibold text-neutral-600 tabular-nums">
          {formatCurrency(total, locale)}
        </p>
        <p className="text-xs text-neutral-500 ms-auto">{t('salesChartHint')}</p>
      </div>

      <SalesChart data={stats.salesSeries} />

      {first && last && (
        <p className="text-2xs text-neutral-400">
          {t('salesChartRange', {
            from: formatDate(first.day, locale, 'short'),
            to: formatDate(last.day, locale, 'short'),
          })}
        </p>
      )}
    </section>
  );
}

async function TopProducts({ shopId, locale }: { shopId: string; locale: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  if (stats.topProducts.length === 0) return null;

  return (
    <section className="rounded-card border-border bg-card space-y-1 border p-4">
      <h2 className="mb-2 text-sm font-bold">{t('topProductsHeading')}</h2>

      {/* Rows rather than a table: four columns at 390px are unreadable however
          they are styled, and the revenue figure is the only one that has to
          line up. */}
      <ul>
        {stats.topProducts.map((product) => (
          <li key={product.id}>
            <Link
              href={`/dashboard/products?q=${encodeURIComponent(product.slug)}`}
              className="rounded-control flex items-center gap-3 p-2 transition-colors duration-150 hover:bg-neutral-50"
            >
              <span className="rounded-control relative h-11 w-11 shrink-0 overflow-hidden bg-neutral-100">
                {product.imagePath && (
                  <Image
                    src={product.imagePath}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="clamp-1 text-sm font-medium">
                  {pickLocale(product.title as never, locale)}
                </span>
                <span className="mt-0.5 block text-2xs text-neutral-500">
                  {t('topProductsStats', {
                    views: formatNumber(product.viewCount, locale),
                    no: product.orderCount,
                    orders: formatNumber(product.orderCount, locale),
                    saves: formatNumber(product.wishlistCount, locale),
                  })}
                </span>
              </span>

              <span className="shrink-0 text-sm font-bold tabular-nums">
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
    <section className="rounded-card border-border bg-card overflow-hidden border">
      <div className="border-border border-b p-4">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="divide-border divide-y">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex gap-3 p-4">
            <Skeleton className="rounded-pill h-10 w-[3px] shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartSkeleton() {
  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-56 w-full" />
    </section>
  );
}

function TableSkeleton() {
  return (
    <section className="rounded-card border-border bg-card space-y-2 border p-4">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-2">
          <Skeleton className="rounded-control h-11 w-11 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </section>
  );
}
