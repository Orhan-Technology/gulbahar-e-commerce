import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';

import { MonthlyRevenueChart } from '@/components/admin/revenue-charts';
import { CampaignQueue } from '@/components/admin/campaign-queue';
import { StatCard, StatCardSkeleton } from '@/components/custom/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { ExportCsvLink } from '@/components/admin/export-csv-link';
import {
  campaignLedger,
  revenueByMonth,
  revenueBySlot,
  revenueMonthToDate,
  revenueTotals,
  topPayingShops,
} from '@/lib/db/queries/admin-revenue';
import { activeShopCount, platformTotals } from '@/lib/db/queries/admin-reports';
import {
  formatCurrency,
  formatDate,
  formatList,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * REVENUE VIEW — quality-bar screen #4 (PRD §7.3, §10.8).
 *
 * The "this is your new income" moment, so it gets storefront-grade polish rather
 * than admin-plain. It is built to answer one question in five seconds — where is
 * our money coming from — and then let the viewer drill: the month's take, then
 * the twelve months behind it, then what is waiting on a decision, then the slot
 * inventory that produced all of it.
 *
 * Every number here is `campaigns.price_paid`, snapshotted at booking. See
 * lib/db/queries/admin-revenue.ts for why that matters. The one exception is the
 * platform GMV tile, which is the shops' trade rather than the mall's income —
 * it is on this page because the honest way to present placement revenue is
 * beside the number it is a small fraction of.
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
    <div className="space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1.5 max-w-prose text-sm text-neutral-500">{t('intro')}</p>
        </div>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <ExportCsvLink report="revenue" />
          <Link
            href="/admin/promotions"
            className="rounded-pill bg-primary text-primary-foreground hover:bg-primary-800 inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold transition-colors duration-150"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t('manageCampaigns')}
          </Link>
        </div>
      </div>

      <Suspense fallback={<HeadlineSkeleton />}>
        <Headline locale={locale} />
      </Suspense>

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <Suspense fallback={<PanelSkeleton className="xl:col-span-3" />}>
          <ByMonth locale={locale} className="xl:col-span-3" />
        </Suspense>
        <Suspense fallback={<PanelSkeleton className="xl:col-span-2" />}>
          <PendingRequests locale={locale} className="xl:col-span-2" />
        </Suspense>
      </div>

      <Suspense fallback={<PanelSkeleton />}>
        <SlotInventory locale={locale} />
      </Suspense>

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <Suspense fallback={<PanelSkeleton className="xl:col-span-2" />}>
          <TopSpenders locale={locale} className="xl:col-span-2" />
        </Suspense>
        <Suspense fallback={<PanelSkeleton className="xl:col-span-3" />}>
          <ActiveTable locale={locale} className="xl:col-span-3" />
        </Suspense>
      </div>

      {/*
        PRD §8.4, stated on the screen that sells the placements rather than
        buried in a policy document. It is the single sentence that keeps the
        marketplace trustworthy, and the person who could quietly break it is
        the one reading this page.
      */}
      <aside className="rounded-card bg-warning-bg flex flex-wrap items-baseline gap-x-4 gap-y-1 p-5">
        <span className="text-warning-fg text-sm font-bold">{t('guardrailLabel')}</span>
        <p className="text-warning-fg/80 min-w-64 flex-1 text-sm leading-relaxed">
          {t('guardrailBody')}
        </p>
      </aside>
    </div>
  );
}

/**
 * The headline. `StatCard` counts up on first paint (PRD §10.6), which is the beat
 * this screen is built around — the total should land while the presenter is still
 * saying the sentence.
 *
 * The lead tile is THIS MONTH, not lifetime: a mall manager bills monthly, and a
 * cumulative total only ever goes up, which makes it useless as a signal.
 *
 * AND THE COMPARISON IS MONTH-TO-DATE, which is the whole reason this tile
 * needed a query of its own. It used to divide the calendar month so far by the
 * WHOLE of the previous month — so on the 2nd it read «؋۰ · −۱۰۰٪», one day of
 * trading measured against thirty, on the first number of the screen this
 * console exists to sell. Technically true and rhetorically ruinous, every
 * month, for the first week of it. The baseline is now the same stretch of last
 * month, and the caption says so rather than leaving "vs last month" to imply a
 * full one.
 */
async function Headline({ locale }: { locale: string }) {
  const t = await getTranslations('adminRevenue');

  const [totals, month, slots, platform, shops] = await Promise.all([
    revenueTotals(),
    revenueMonthToDate(),
    revenueBySlot(),
    platformTotals(30),
    activeShopCount(30),
  ]);

  const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const occupied = slots.reduce((sum, slot) => sum + slot.occupied, 0);

  return (
    <>
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        variant="feature"
        label={month.partial ? t('monthToDateLabel') : t('monthRevenueLabel')}
        value={month.current}
        format="currency"
        delta={month.delta}
        hint={
          /*
           * WHAT THE TILE SAYS WHEN IT IS ZERO.
           *
           * With no comparable stretch behind it, this used to fall back to the
           * LIFETIME total — «مجموع تا امروز ۱٬۲۳۷٬۰۰۰» printed under a headline
           * of ؋۰, two numbers about different periods stacked on each other.
           * Booked value is the honest thing to put there: it is about the SAME
           * month, and it is the reason the headline is not really zero.
           */
          month.delta === null
            ? month.bookedThisMonth > 0
              ? t('bookedThisMonth', {
                  amount: formatCurrency(month.bookedThisMonth, locale),
                  n: month.bookedCount,
                  count: formatNumber(month.bookedCount, locale),
                })
              : t('lifetime', { amount: formatCurrency(totals.total, locale) })
            : month.partial
              ? // Names the actual comparison. "vs last month" beside a
                // part-month figure is the sentence that made the tile lie.
                t('vsSamePeriodLastMonth', { days: formatNumber(month.dayOfMonth, locale) })
              : t('vsLastMonth')
        }
      />
      <StatCard
        label={t('occupancyLabel')}
        value={capacity > 0 ? occupied / capacity : 0}
        format="percent"
        hint={t('occupancyHint', {
          occupied: formatNumber(occupied, locale),
          capacity: formatNumber(capacity, locale),
        })}
      />
      <StatCard
        label={t('activeCampaigns')}
        value={totals.activeCount}
        hint={
          totals.requestedCount > 0
            ? t('pendingHint', {
                n: totals.requestedCount,
                count: formatNumber(totals.requestedCount, locale),
              })
            : t('noPendingHint')
        }
        hintTone={totals.requestedCount > 0 ? 'danger' : 'muted'}
      />
      <StatCard
        label={t('platformGmv')}
        value={platform.gmv}
        // Currency, in full. The mall's own GMV abbreviated to "1.2M" is the
        // one number on this screen nobody wants rounded (Prompt C2).
        format="currency"
        hint={t('gmvHint', {
          orders: formatNumber(platform.orderCount, locale),
          shops: formatNumber(shops.trading, locale),
        })}
      />
    </dl>

    {/*
      One line naming what every tile above measures. Four money figures over
      three different windows were previously distinguishable only by reading
      each caption; a mall director quoting one of them out loud needs the
      period attached to it.
    */}
    <p className="text-muted-foreground mt-2 text-xs">
      {t('periodsNote', {
        day: formatNumber(month.dayOfMonth, locale),
        lifetime: formatCurrency(totals.total, locale),
      })}
    </p>
    </>
  );
}

async function ByMonth({ locale, className }: { locale: string; className?: string }) {
  const t = await getTranslations('adminRevenue');
  const months = await revenueByMonth(12);
  const total = months.reduce((sum, month) => sum + month.revenue, 0);

  return (
    <Panel
      title={t('byMonthHeading')}
      note={t('twelveMonths', { total: formatCurrency(total, locale) })}
      className={className}
    >
      <MonthlyRevenueChart
        data={months.map((month) => ({ month: month.month, revenue: month.revenue }))}
      />
      <p className="text-2xs text-neutral-400">{t('byMonthNote')}</p>
    </Panel>
  );
}

/**
 * The decision queue, on the page where the money is. Rows carry the real
 * approve and reject controls — `CampaignQueue` owns the mandatory rejection
 * reason, so this page does not reimplement half of it.
 */
async function PendingRequests({ locale, className }: { locale: string; className?: string }) {
  const t = await getTranslations('adminRevenue');
  const requested = await campaignLedger('requested');

  return (
    <Panel
      title={t('pendingHeading')}
      count={requested.length > 0 ? formatNumber(requested.length, locale) : undefined}
      className={className}
    >
      {requested.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">{t('noPending')}</p>
      ) : (
        <CampaignQueue
          variant="compact"
          campaigns={requested.map((campaign) => ({
            id: campaign.id,
            status: campaign.status,
            shopId: campaign.shopId,
            shopName: pickLocale(campaign.shopName, locale),
            slotName: pickLocale(campaign.slotName, locale),
            productTitle: campaign.productTitle
              ? pickLocale(campaign.productTitle, locale)
              : null,
            startsAt: campaign.startsAt.toISOString(),
            endsAt: campaign.endsAt.toISOString(),
            weeks: campaign.weeks,
            pricePaid: campaign.pricePaid,
            impressions: campaign.impressions,
            clicks: campaign.clicks,
            rejectionReason: campaign.rejectionReason,
          }))}
        />
      )}
    </Panel>
  );
}

/**
 * Slot inventory — what the mall has to sell, how much of it is sold, and to
 * whom. This is the table a manager prices from, so it shows the fixed weekly
 * rate beside the occupancy it is producing.
 */
async function SlotInventory({ locale }: { locale: string }) {
  const t = await getTranslations('adminRevenue');
  const slots = await revenueBySlot();

  return (
    <Panel title={t('inventoryHeading')} note={t('inventoryNote')} bleed>
      <div className="overflow-x-auto">
        <table className="w-full min-w-3xl text-sm">
          <thead>
            <tr className="text-2xs bg-neutral-50 font-semibold text-neutral-500">
              <th className="px-5 py-3 text-start font-semibold">{t('colSlotName')}</th>
              <th className="px-5 py-3 text-start font-semibold">{t('colCapacity')}</th>
              <th className="px-5 py-3 text-start font-semibold">{t('colOccupied')}</th>
              <th className="px-5 py-3 text-start font-semibold">{t('colCurrentShops')}</th>
              <th className="px-5 py-3 text-end font-semibold">{t('colWeeklyPrice')}</th>
              {/*
                TWO MONEY COLUMNS, because one of them is zero for the first
                weeks of every month and on its own it reads as "this slot earns
                nothing". Billed-this-month is campaigns INVOICED since the 1st
                (a weekly fee is charged up front); running-this-month is every
                sold campaign whose window touches the month, which is what is
                actually on the walls. The header says which is which.
              */}
              <th className="px-5 py-3 text-end font-semibold">{t('colBilledMonth')}</th>
              <th className="px-5 py-3 text-end font-semibold">{t('colRunningMonth')}</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {slots.map((slot) => {
              const full = slot.capacity > 0 && slot.occupied >= slot.capacity;
              const names = slot.currentShops.map((name) => pickLocale(name, locale));

              return (
                <tr key={slot.id}>
                  <td className="px-5 py-4 font-medium">{pickLocale(slot.name, locale)}</td>
                  <td className="px-5 py-4 tabular-nums">
                    {formatNumber(slot.capacity, locale)}
                  </td>
                  <td
                    className={
                      full
                        ? 'text-primary-700 px-5 py-4 font-semibold'
                        : slot.occupancy >= 0.5
                          ? 'text-warning px-5 py-4 font-semibold'
                          : 'px-5 py-4 font-semibold text-neutral-400'
                    }
                  >
                    {t('occupiedOf', {
                      occupied: formatNumber(slot.occupied, locale),
                      capacity: formatNumber(slot.capacity, locale),
                    })}
                    {full ? ` · ${t('full')}` : ''}
                  </td>
                  {/* Two names fit; beyond that the count is the useful fact. */}
                  <td className="px-5 py-4 text-neutral-600">
                    {names.length === 0
                      ? t('slotVacant')
                      : names.length <= 2
                        ? formatList(names, locale)
                        : t('shopCount', { count: formatNumber(names.length, locale) })}
                  </td>
                  <td className="px-5 py-4 text-end tabular-nums">
                    {formatCurrency(slot.pricePerWeek, locale)}
                  </td>
                  <td className="px-5 py-4 text-end tabular-nums text-neutral-500">
                    {formatCurrency(slot.monthRevenue, locale)}
                  </td>
                  <td className="px-5 py-4 text-end font-bold tabular-nums">
                    {formatCurrency(slot.monthRunningRevenue, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
        <p className="py-6 text-center text-sm text-neutral-500">{t('noRevenue')}</p>
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
                  className="bg-primary-500 rounded-pill h-full"
                  style={{ width: `${top > 0 ? Math.round((shop.spend / top) * 100) : 0}%` }}
                />
              </div>
              <p className="text-2xs text-neutral-500">
                {t('campaignCount', {
                  n: shop.campaignCount,
                  count: formatNumber(shop.campaignCount, locale),
                })}
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
  const [all, totals] = await Promise.all([campaignLedger(), revenueTotals()]);
  // Running placements are what the money is buying right now.
  const rows = all.filter(
    (campaign) => campaign.status === 'active' || campaign.status === 'approved',
  );
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;

  return (
    <Panel
      title={t('activeHeading')}
      note={t('reachSummary', {
        impressions: formatNumber(totals.impressions, locale),
        clicks: formatNumber(totals.clicks, locale),
        ctr: formatPercent(ctr, locale),
      })}
      className={className}
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">{t('noActive')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-lg text-xs">
            <thead>
              <tr className="border-border border-b text-start text-neutral-500">
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
                      <span className="clamp-1 block text-neutral-500">
                        {pickLocale(campaign.productTitle, locale)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-neutral-500">
                    {formatDate(campaign.startsAt, locale, 'medium')} —{' '}
                    {formatDate(campaign.endsAt, locale, 'medium')}
                  </td>
                  <td className="py-2 text-end font-bold">
                    {formatCurrency(campaign.pricePaid, locale)}
                  </td>
                  <td className="py-2 text-end text-neutral-500">
                    {formatNumber(campaign.impressions, locale)}
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

/**
 * `bleed` drops the body padding for panels whose content draws its own — a
 * table needs its header band to reach the panel edge, or the tinted strip
 * floats with a white margin around it.
 */
function Panel({
  title,
  note,
  count,
  bleed = false,
  className,
  children,
}: {
  title: string;
  note?: string;
  count?: string;
  bleed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-card border-border bg-card overflow-hidden border ${className ?? ''}`}
    >
      <header className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b p-5">
        <h2 className="text-base font-bold">{title}</h2>
        {count && (
          <span className="rounded-pill bg-danger text-danger-fg text-2xs px-2 py-1 font-bold tabular-nums">
            {count}
          </span>
        )}
        {note && <p className="text-xs text-neutral-500">{note}</p>}
      </header>

      <div className={bleed ? '' : 'space-y-3 p-5'}>{children}</div>
    </section>
  );
}

function HeadlineSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  );
}

function PanelSkeleton({ className }: { className?: string }) {
  return (
    <section
      className={`rounded-card border-border bg-card overflow-hidden border ${className ?? ''}`}
    >
      <div className="border-border border-b p-5">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="p-5">
        <Skeleton className="h-48 w-full" />
      </div>
    </section>
  );
}
