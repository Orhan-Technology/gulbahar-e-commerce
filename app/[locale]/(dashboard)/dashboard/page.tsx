import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { Eye, ShoppingBag, Star, Wallet } from 'lucide-react';

import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { ActionQueue } from '@/components/dashboard/action-queue';
import {
  DashboardGreeting,
  DashboardGreetingSkeleton,
} from '@/components/dashboard/dashboard-greeting';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { actionQueueItems, shopDashboardStats } from '@/lib/db/queries/dashboard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Shop dashboard home — quality-bar screen #3 (PRD §6.1, §10.8).
 *
 * ACTION CENTRE FIRST, and that ordering is the whole argument of the screen.
 * The previous layout led with four numbers, which is the shape of a report;
 * the person opening this is standing behind a counter with a customer in front
 * of them, and the first thing they need is the list of things that are waiting
 * on them. Numbers are how the week went — they come second, and they come as
 * doors rather than as figures: every tile lands on the rows behind it, already
 * filtered.
 *
 * Reading order, unchanged between phone and desktop:
 *
 *   1. who you are and whether the shop is live
 *   2. what needs you now, with the actions on the rows themselves
 *   3. how it is going — four KPIs, each a drill-down
 *   4. the thirty-day shape
 *   5. what is actually selling
 *
 * Every band is its own Suspense boundary so a slower query never delays the
 * queue, and each fallback matches its final layout exactly (PRD §10.5).
 */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Suspense fallback={<DashboardGreetingSkeleton />}>
        <DashboardGreeting name={user.name ?? ''} shopId={user.shopId} />
      </Suspense>

      <Suspense fallback={<QueueSkeleton />}>
        <QueueSection shopId={user.shopId} locale={locale} />
      </Suspense>

      <Suspense fallback={<KpiRowSkeleton />}>
        <KpiRow shopId={user.shopId} locale={locale} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <ChartSection shopId={user.shopId} locale={locale} />
      </Suspense>

      <Suspense fallback={<TopSellersSkeleton />}>
        <TopSellers shopId={user.shopId} locale={locale} />
      </Suspense>
    </div>
  );
}

async function QueueSection({ shopId, locale }: { shopId: string; locale: string }) {
  const entries = await actionQueueItems(shopId, locale);
  return <ActionQueue entries={entries} />;
}

/**
 * Four KPIs, each one a link.
 *
 * The set answers four different questions on purpose — money today, volume
 * this week, demand this week, and standing — so no two tiles move together.
 * Two revenue figures side by side look like a fuller dashboard and tell the
 * reader one thing.
 */
async function KpiRow({ shopId, locale }: { shopId: string; locale: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={t('todaySales')}
        value={stats.todaySales}
        format="currency"
        tone="primary"
        icon={<Wallet className="h-4 w-4" aria-hidden />}
        href="/dashboard/orders?range=1d"
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
        label={t('weekOrdersLabel')}
        value={stats.weekOrderCount}
        icon={<ShoppingBag className="h-4 w-4" aria-hidden />}
        href="/dashboard/orders?range=7d"
        delta={stats.ordersDelta}
        hint={t('vsLastWeek')}
        hintTone={(stats.ordersDelta ?? 0) >= 0 ? 'success' : 'danger'}
      />

      <StatCard
        label={t('weekViewsLabel')}
        value={stats.weekViews}
        format="compact"
        icon={<Eye className="h-4 w-4" aria-hidden />}
        // Views are a property of the catalogue, so the drill-down is the
        // product list ordered by exactly the number the tile is showing.
        href="/dashboard/products?sort=views"
        delta={stats.viewsDelta}
        hint={t('vsLastWeek')}
        hintTone={(stats.viewsDelta ?? 0) >= 0 ? 'success' : 'danger'}
      />

      <StatCard
        label={t('shopRatingLabel')}
        value={stats.rating.average}
        format="decimal"
        icon={<Star className="h-4 w-4" aria-hidden />}
        href="/dashboard/reviews"
        hint={
          stats.rating.count > 0
            ? t('ratingCount', {
                // `n` pluralises, `count` renders — see the note in the query module.
                n: stats.rating.count,
                count: formatNumber(stats.rating.count, locale),
              })
            : t('noReviewsYet')
        }
      />
    </div>
  );
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
        <p className="ms-auto text-xs text-neutral-500">{t('salesChartHint')}</p>
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

/**
 * Best sellers of the week — ranked by UNITS, not revenue.
 *
 * See the query for why: by revenue, one laptop outranks forty phone cases, and
 * "what is selling" means the cases. Revenue still rides on the row, because it
 * is the second question and it costs nothing to answer it here.
 */
async function TopSellers({ shopId, locale }: { shopId: string; locale: string }) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId);

  if (stats.topProducts.length === 0) return null;

  return (
    <section className="rounded-card border-border bg-card space-y-1 border p-4">
      <h2 className="mb-2 text-sm font-bold">{t('topSellersHeading')}</h2>

      {/* Rows rather than a table: four columns at 390px are unreadable however
          they are styled, and the revenue figure is the only one that has to
          line up. */}
      <ul>
        {stats.topProducts.map((product, index) => (
          <li key={product.id}>
            <Link
              href={`/dashboard/products?q=${encodeURIComponent(product.slug)}`}
              className={cn(
                pressable,
                'rounded-control flex items-center gap-3 p-2 transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-50',
              )}
            >
              {/* Rank, so the ordering is stated rather than merely implied. */}
              <span className="w-4 shrink-0 text-center text-xs font-bold text-neutral-400 tabular-nums">
                {formatNumber(index + 1, locale)}
              </span>

              <span className="rounded-control relative h-11 w-11 shrink-0 overflow-hidden bg-neutral-100">
                {product.imagePath && (
                  <Image src={product.imagePath} alt="" fill sizes="44px" className="object-cover" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="clamp-1 text-sm font-medium">
                  {pickLocale(product.title as never, locale)}
                </span>
                <span className="text-2xs mt-0.5 block text-neutral-500">
                  {t('topSellersUnits', {
                    // `n` pluralises, `count` renders — see the query module.
                    n: product.orderCount,
                    count: formatNumber(product.orderCount, locale),
                    views: formatNumber(product.viewCount, locale),
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

function KpiRowSkeleton() {
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

function TopSellersSkeleton() {
  return (
    <section className="rounded-card border-border bg-card space-y-2 border p-4">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-2">
          <Skeleton className="h-3 w-4 shrink-0" />
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
