import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Eye, MousePointerClick, TrendingUp, Wallet } from 'lucide-react';

import { MonthlyRevenueChart, SlotRevenueChart } from '@/components/admin/revenue-charts';
import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import {
  campaignLedger,
  revenueByMonth,
  revenueBySlot,
  revenueTotals,
  topPayingShops,
} from '@/lib/db/queries/admin-revenue';
import {
  formatCompact,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * REVENUE VIEW — quality-bar screen #4 (PRD §7.3, §10.8).
 *
 * The "this is your new income" moment, so it gets storefront-grade polish rather
 * than admin-plain. It is built to answer one question in five seconds — where is
 * our money coming from — and then let the viewer drill: headline total, then which
 * slots earn it, then which weeks, then which tenants, then the individual
 * placements.
 *
 * Every number here is `campaigns.price_paid`, snapshotted at booking. See
 * lib/db/queries/admin-revenue.ts for why that matters.
 */
export default async function AdminRevenuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminRevenue');

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <Suspense fallback={<HeadlineSkeleton />}>
        <Headline locale={locale} />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-5">
        <Suspense fallback={<PanelSkeleton className="xl:col-span-3" />}>
          <BySlot locale={locale} className="xl:col-span-3" />
        </Suspense>
        <Suspense fallback={<PanelSkeleton className="xl:col-span-2" />}>
          <ByMonth className="xl:col-span-2" />
        </Suspense>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Suspense fallback={<PanelSkeleton className="xl:col-span-2" />}>
          <TopSpenders locale={locale} className="xl:col-span-2" />
        </Suspense>
        <Suspense fallback={<PanelSkeleton className="xl:col-span-3" />}>
          <ActiveTable locale={locale} className="xl:col-span-3" />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The headline. `StatCard` counts up on first paint (PRD §10.6), which is the beat
 * this screen is built around — the total should land while the presenter is still
 * saying the sentence.
 */
async function Headline({ locale }: { locale: string }) {
  const t = await getTranslations('adminRevenue');
  const totals = await revenueTotals();
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;

  return (
    <section className="space-y-3">
      <div className="rounded-card from-primary-700 to-primary-900 shadow-card p-6 text-white ltr:bg-linear-to-r rtl:bg-linear-to-l">
        <p className="text-sm opacity-80">{t('totalLabel')}</p>
        <p className="mt-1 text-3xl font-bold">
          {/* Wrapped so the currency formatting matches every other amount. */}
          {formatCurrency(totals.total, locale)}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-90">
          <span>{t('fromShops', { count: formatNumber(totals.payingShops, locale) })}</span>
          <span>
            {t('runningNow', {
              count: formatNumber(totals.activeCount, locale),
              amount: formatCurrency(totals.activeRevenue, locale),
            })}
          </span>
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('activeRevenue')}
          value={totals.activeRevenue}
          format="currency"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label={t('impressions')}
          value={totals.impressions}
          icon={<Eye className="h-4 w-4" />}
        />
        <StatCard
          label={t('clicks')}
          value={totals.clicks}
          icon={<MousePointerClick className="h-4 w-4" />}
        />
        <div className="rounded-card border-border bg-card shadow-card border p-4">
          <dt className="text-muted-foreground text-xs">{t('ctr')}</dt>
          <dd className="mt-1 text-2xl font-bold">{formatPercent(ctr, locale)}</dd>
        </div>
      </dl>

      {totals.requestedCount > 0 && (
        <Link
          href="/admin/promotions"
          className="rounded-card border-warning-border bg-warning-bg text-warning hover:border-warning flex items-center gap-2 border p-3 text-xs"
        >
          <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
          {t('pendingRequests', { count: formatNumber(totals.requestedCount, locale) })}
        </Link>
      )}
    </section>
  );
}

async function BySlot({ locale, className }: { locale: string; className?: string }) {
  const t = await getTranslations('adminRevenue');
  const slots = await revenueBySlot();

  return (
    <Panel title={t('bySlotHeading')} className={className}>
      <SlotRevenueChart
        data={slots.map((slot) => ({
          key: slot.key,
          name: pickLocale(slot.name, locale),
          revenue: slot.revenue,
          occupancy: slot.occupancy,
        }))}
      />

      {/* The chart shows scale; the list gives the exact figures and the occupancy
          each bar's colour encodes. */}
      <ul className="divide-border divide-y text-xs">
        {slots.map((slot) => (
          <li key={slot.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-32 flex-1 font-medium">{pickLocale(slot.name, locale)}</span>
            <span className="text-muted-foreground">
              {t('perWeek', { price: formatCurrency(slot.pricePerWeek, locale) })}
            </span>
            <Badge variant={slot.occupancy >= 1 ? 'success' : 'secondary'}>
              {t('occupancyValue', { value: formatPercent(slot.occupancy, locale) })}
            </Badge>
            <span className="text-accent-700 font-bold">
              {formatCurrency(slot.revenue, locale)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

async function ByMonth({ className }: { className?: string }) {
  const t = await getTranslations('adminRevenue');
  const months = await revenueByMonth(6);

  return (
    <Panel title={t('byMonthHeading')} className={className}>
      <MonthlyRevenueChart
        data={months.map((month) => ({ month: month.month, revenue: month.revenue }))}
      />
      <p className="text-muted-foreground text-xs">{t('byMonthNote')}</p>
    </Panel>
  );
}

async function TopSpenders({ locale, className }: { locale: string; className?: string }) {
  const t = await getTranslations('adminRevenue');
  const shops = await topPayingShops(6);
  const top = shops[0]?.spend ?? 0;

  return (
    <Panel title={t('topShopsHeading')} className={className}>
      {shops.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t('noRevenue')}</p>
      ) : (
        <ul className="space-y-2.5">
          {shops.map((shop) => (
            <li key={shop.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <Link href={`/admin/shops/${shop.id}`} className="hover:text-primary clamp-1">
                  {pickLocale(shop.name, locale)}
                </Link>
                <span className="shrink-0 font-bold">{formatCurrency(shop.spend, locale)}</span>
              </div>
              {/* Grows from the inline start, so it fills right-to-left in Dari. */}
              <div className="rounded-pill h-1.5 w-full overflow-hidden bg-neutral-100">
                <div
                  className="bg-accent-500 rounded-pill h-full"
                  style={{ width: `${top > 0 ? Math.round((shop.spend / top) * 100) : 0}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t('campaignCount', { count: formatNumber(shop.campaignCount, locale) })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function ActiveTable({ locale, className }: { locale: string; className?: string }) {
  const t = await getTranslations('adminRevenue');
  const all = await campaignLedger();
  // Running placements are what the money is buying right now.
  const rows = all.filter(
    (campaign) => campaign.status === 'active' || campaign.status === 'approved',
  );

  return (
    <Panel title={t('activeHeading')} className={className}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t('noActive')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-lg text-xs">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-start">
                <th className="pb-2 text-start font-normal">{t('colShop')}</th>
                <th className="pb-2 text-start font-normal">{t('colSlot')}</th>
                <th className="pb-2 text-start font-normal">{t('colWindow')}</th>
                <th className="pb-2 text-end font-normal">{t('colPrice')}</th>
                <th className="pb-2 text-end font-normal">{t('colReach')}</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="py-2">
                    <Link
                      href={`/admin/shops/${campaign.shopId}`}
                      className="hover:text-primary font-medium"
                    >
                      {pickLocale(campaign.shopName, locale)}
                    </Link>
                  </td>
                  <td className="py-2">
                    {pickLocale(campaign.slotName, locale)}
                    {campaign.productTitle && (
                      <span className="text-muted-foreground clamp-1 block">
                        {pickLocale(campaign.productTitle, locale)}
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground py-2">
                    {formatDate(campaign.startsAt, locale, 'short')} —{' '}
                    {formatDate(campaign.endsAt, locale, 'short')}
                  </td>
                  <td className="py-2 text-end font-bold">
                    {formatCurrency(campaign.pricePaid, locale)}
                  </td>
                  <td className="text-muted-foreground py-2 text-end">
                    {formatCompact(campaign.impressions, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-card border-border bg-card space-y-3 border p-4 ${className ?? ''}`}
    >
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

function HeadlineSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="rounded-card h-28 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

function PanelSkeleton({ className }: { className?: string }) {
  return (
    <section
      className={`rounded-card border-border bg-card space-y-3 border p-4 ${className ?? ''}`}
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-48 w-full" />
    </section>
  );
}
