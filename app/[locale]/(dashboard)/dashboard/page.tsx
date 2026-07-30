import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { Eye, ShoppingBag, Star, Wallet } from 'lucide-react';

import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { ActionQueue } from '@/components/dashboard/action-queue';
import { DashboardGreeting } from '@/components/dashboard/dashboard-greeting';
import { SetupGuide, SetupGuideSkeleton } from '@/components/dashboard/setup-guide';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { actionQueueItems, shopDashboardStats } from '@/lib/db/queries/dashboard';
import { parseConsoleRange, type ConsoleRange } from '@/lib/console-range';
import { ConsolePageHeader } from '@/components/console/page-header';
import { RangeControl } from '@/components/console/range-control';
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
export default async function DashboardPage({
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
  const range = parseConsoleRange(rangeKey);

  return (
    /*
     * TWO REGIONS FROM `xl` (Prompt C3): the work down the main column, the
     * numbers in a rail beside it. The page used to centre a 1024px column on a
     * 1440px screen, which left 40% of a shopkeeper's monitor empty while the
     * best-seller list was three items long and scrolled off the bottom.
     *
     * Below `xl` it is one column in the same reading order — queue, numbers,
     * chart, sellers — because on a phone the queue must not be pushed down by
     * four tiles.
     */
    <div className="mx-auto max-w-[100rem] space-y-5 p-4 md:p-6">
      <ConsolePageHeader
        title={<DashboardGreeting name={user.name ?? ''} />}
        actions={<RangeControl current={range.key} />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <div className="space-y-5">
          {/* Above the queue, because for a new tenant it IS the queue. It
              returns null once every step is done (Prompt C5). */}
          <Suspense fallback={<SetupGuideSkeleton />}>
            <SetupGuide shopId={user.shopId} />
          </Suspense>

          <Suspense fallback={<QueueSkeleton />}>
            <QueueSection shopId={user.shopId} locale={locale} />
          </Suspense>

          <Suspense fallback={<ChartSkeleton />}>
            <ChartSection shopId={user.shopId} locale={locale} range={range} />
          </Suspense>
        </div>

        <div className="space-y-5">
          <Suspense fallback={<KpiRowSkeleton />}>
            <KpiRow shopId={user.shopId} locale={locale} range={range} />
          </Suspense>

          <Suspense fallback={<TopSellersSkeleton />}>
            <TopSellers shopId={user.shopId} locale={locale} range={range} />
          </Suspense>
        </div>
      </div>
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
async function KpiRow({
  shopId,
  locale,
  range,
}: {
  shopId: string;
  locale: string;
  range: ConsoleRange;
}) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId, range);
  const days = formatNumber(range.days, locale);

  return (
    /* Two across on a phone, four on a tablet, ONE in the desktop rail — the
       rail is 21rem wide and a tile has to stay readable in it. */
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-1">
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
        /*
         * A card in a row of four never goes silent (Prompt C2). When there is
         * no baseline the hint SAYS SO rather than disappearing — an empty
         * caption beside three populated ones reads as a rendering fault, and
         * "vs previous period" printed with no percentage beside it is worse
         * still, because it promises a comparison it did not make.
         */
        hint={
          stats.todaySales === 0
            ? t('noSalesYet')
            : stats.todayDelta !== null
              ? t('vsYesterday')
              : t('noBaseline')
        }
        hintTone={(stats.todayDelta ?? 0) >= 0 ? 'success' : 'danger'}
      />

      <StatCard
        label={t('rangeOrdersLabel', { days })}
        value={stats.rangeOrderCount}
        icon={<ShoppingBag className="h-4 w-4" aria-hidden />}
        href={`/dashboard/orders?range=${range.key}`}
        delta={stats.ordersDelta}
        hint={stats.ordersDelta !== null ? t('vsPreviousRange') : t('noBaseline')}
        hintTone={(stats.ordersDelta ?? 0) >= 0 ? 'success' : 'danger'}
      />

      <StatCard
        label={t('rangeViewsLabel', { days })}
        value={stats.rangeViews}
        /*
         * FULL GROUPED NUMBER, never "1.2K" (Prompt C2). Compact notation does
         * not localise to Dari digits the way the grouped form does, and it
         * hides precision from the one person entitled to it — the shopkeeper
         * reading their own business.
         */
        format="count"
        icon={<Eye className="h-4 w-4" aria-hidden />}
        // Views are a property of the catalogue, so the drill-down is the
        // product list ordered by exactly the number the tile is showing.
        href="/dashboard/products?sort=views"
        delta={stats.viewsDelta}
        hint={stats.viewsDelta !== null ? t('vsPreviousRange') : t('noBaseline')}
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

async function ChartSection({
  shopId,
  locale,
  range,
}: {
  shopId: string;
  locale: string;
  range: ConsoleRange;
}) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId, range);

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
          {/* 'medium', not 'short': a numeric range reads as 7/1/26 in
              en-US, which is the seventh of January to an Afghan reader
              (Prompt C2). */}
          {t('salesChartRange', {
            from: formatDate(first.day, locale, 'medium'),
            to: formatDate(last.day, locale, 'medium'),
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
async function TopSellers({
  shopId,
  locale,
  range,
}: {
  shopId: string;
  locale: string;
  range: ConsoleRange;
}) {
  const t = await getTranslations('dashboard');
  const stats = await shopDashboardStats(shopId, range);

  if (stats.topProducts.length === 0) return null;

  return (
    <section className="rounded-card border-border bg-card space-y-1 border p-4">
      {/* The window is IN the heading: this list and the chart above it cover
          the same thirty days, and saying so is what makes them comparable
          (Prompt C2). */}
      <h2 className="mb-2 text-sm font-bold">
        {t('topSellersHeadingRanged', { days: formatNumber(range.days, locale) })}
      </h2>

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
