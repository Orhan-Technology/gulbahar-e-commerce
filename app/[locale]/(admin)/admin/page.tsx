import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Megaphone, ShoppingBag, Star, Store } from 'lucide-react';

import { requireAdmin } from '@/lib/auth/guards';
import { adminPendingCounts, platformPromotionRevenue } from '@/lib/db/queries/admin';
import { platformStats } from '@/lib/db/queries/orders';
import { shopCountsByStatus } from '@/lib/db/queries/shops';
import { formatCompact, formatCurrency, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Admin overview (PRD §7).
 *
 * Two halves, in the order an administrator actually needs them: what is WAITING
 * for a decision, then how the platform is doing. A dashboard that opened with
 * charts would bury the pending shop somebody is waiting on.
 */
export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminOverview');

  const WINDOW_DAYS = 30;
  const [counts, shopCounts, stats, promotions] = await Promise.all([
    adminPendingCounts(),
    shopCountsByStatus(),
    platformStats(WINDOW_DAYS),
    platformPromotionRevenue(WINDOW_DAYS),
  ]);

  const queues = [
    { key: 'shops', href: '/admin/shops?status=pending', icon: Store, count: counts.pendingShops },
    {
      key: 'campaigns',
      href: '/admin/promotions',
      icon: Megaphone,
      count: counts.requestedCampaigns,
    },
    { key: 'reviews', href: '/admin/reviews', icon: Star, count: counts.reportedReviews },
    {
      key: 'orders',
      href: '/admin/orders?status=placed',
      icon: ShoppingBag,
      count: counts.placedOrders,
    },
  ];

  const waiting = queues.reduce((sum, queue) => sum + queue.count, 0);
  const totalShops = Object.values(shopCounts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {waiting > 0
            ? t('waitingSummary', { count: formatNumber(waiting, locale) })
            : t('nothingWaiting')}
        </p>
      </div>

      {/* What needs a decision, first. */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold">{t('queuesHeading')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {queues.map((queue) => (
            <li key={queue.key}>
              <Link
                href={queue.href}
                className={`rounded-card group flex items-center gap-3 border p-4 transition-colors duration-150 ${
                  queue.count > 0
                    ? 'border-warning-border bg-warning-bg hover:border-warning'
                    : 'border-border bg-card hover:border-primary'
                }`}
              >
                <span
                  className={`rounded-control flex h-10 w-10 shrink-0 items-center justify-center ${
                    queue.count > 0
                      ? 'bg-warning text-warning-fg'
                      : 'bg-neutral-100 text-neutral-500'
                  }`}
                  aria-hidden
                >
                  <queue.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold">{formatNumber(queue.count, locale)}</p>
                  <p className="text-muted-foreground text-xs">{t(`queues.${queue.key}`)}</p>
                </div>
                <ArrowRight
                  className="text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Platform health, last 30 days */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold">{t('healthHeading')}</h2>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label={t('gmv')} value={formatCurrency(stats.gmv, locale)} />
          <Stat label={t('orders')} value={formatNumber(stats.orderCount, locale)} />
          {/* The platform's own income, distinct from the merchandise it moves. */}
          <Stat
            label={t('promotionRevenue')}
            value={formatCurrency(promotions.revenue, locale)}
            tone="accent"
          />
          <Stat
            label={t('activeShops')}
            value={`${formatNumber(shopCounts.approved ?? 0, locale)} / ${formatNumber(totalShops, locale)}`}
          />
        </dl>
        <p className="text-muted-foreground text-xs">{t('healthNote')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">{t('shopsHeading')}</h2>
        <ul className="flex flex-wrap gap-2">
          {(['approved', 'pending', 'suspended', 'closed'] as const).map((status) => (
            <li key={status}>
              <Link
                href={`/admin/shops?status=${status}`}
                className="rounded-pill border-border bg-card hover:border-primary flex items-center gap-2 border px-3 py-1.5 text-xs"
              >
                {t(`shopStatus.${status}`)}
                <span className="font-bold">{formatCompact(shopCounts[status] ?? 0, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <div className="rounded-card border-border bg-card border p-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={`mt-1 text-lg font-bold ${tone === 'accent' ? 'text-primary-700' : 'text-foreground'}`}
      >
        {value}
      </dd>
    </div>
  );
}
