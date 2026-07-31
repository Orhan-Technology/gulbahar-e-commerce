import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, Building2, Store } from 'lucide-react';

import { FloorPlanGrid } from '@/components/admin/floor-plan-grid';
import { UnitEditor } from '@/components/admin/unit-editor';
import { ConsolePageHeader } from '@/components/console/page-header';
import { RangeControl } from '@/components/console/range-control';
import { EmptyState } from '@/components/custom/empty-state';
import { requireAdmin } from '@/lib/auth/guards';
import { parseConsoleRange, type ConsoleRangeKey } from '@/lib/console-range';
import { pickLocale } from '@/lib/db/localized';
import { floorOccupancy } from '@/lib/db/queries/mall';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

type Query = { range?: ConsoleRangeKey };

/**
 * Floor occupancy (Prompt C9).
 *
 * THE MOST NATURAL VIEW OF THE CLIENT'S BUSINESS, and the one no generic
 * marketplace admin can have: they own a building with three floors and
 * numbered units, and every other screen in this console makes them think in
 * shops instead. This one is the floor plan they already have on the wall.
 *
 * Each floor answers three questions in order: how full is it, what is on it,
 * and what is it earning. The plan comes first because that is the one that
 * reads at a glance; the table under it is for the floor someone stopped at.
 *
 * REVENUE IS THE SAME NUMBER as the revenue report — fulfilled orders,
 * attributed through order_items so a basket split between two floors is split
 * between them (Prompt C2). A floor total that did not reconcile with the
 * report would make both untrustworthy.
 */
export default async function AdminFloorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  await requireAdmin(locale);
  const t = await getTranslations('adminFloors');

  const range = parseConsoleRange(query.range);
  const floors = await floorOccupancy(range.days);

  const totals = floors.reduce(
    (sum, floor) => ({
      shops: sum.shops + floor.shops.length,
      vacant: sum.vacant + floor.vacantUnits.length,
      revenue: sum.revenue + floor.revenue,
    }),
    { shops: 0, vacant: 0, revenue: 0 },
  );

  return (
    <div className="space-y-5 p-6">
      <ConsolePageHeader
        title={t('title')}
        description={t('subtitle', {
          floors: formatNumber(floors.length, locale),
          shops: formatNumber(totals.shops, locale),
          vacant: formatNumber(totals.vacant, locale),
        })}
        actions={<RangeControl current={range.key} />}
      />

      {floors.length === 0 ? (
        <EmptyState
          illustration={<Building2 className="h-7 w-7" aria-hidden />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('emptyAction'), href: '/admin/shops' }}
        />
      ) : (
        floors.map((floor) => (
          <section
            key={floor.floor}
            data-floor={floor.floor}
            className="rounded-card border-border bg-card space-y-4 border p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base font-bold">
                {t('floorTitle', { floor: formatNumber(floor.floor, locale) })}
              </h2>

              <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <Stat label={t('active')} value={formatNumber(floor.counts.active, locale)} />
                <Stat label={t('pending')} value={formatNumber(floor.counts.pending, locale)} />
                <Stat
                  label={t('unverified')}
                  value={formatNumber(floor.counts.unverified, locale)}
                />
                <Stat label={t('vacant')} value={formatNumber(floor.vacantUnits.length, locale)} />
                <Stat
                  label={t('revenue', { days: formatNumber(range.days, locale) })}
                  value={formatCurrency(floor.revenue, locale)}
                  strong
                />
              </dl>
            </div>

            <FloorPlanGrid floor={floor} />

            <ul className="divide-border divide-y">
              {floor.shops.map((shop) => (
                <li key={shop.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="rounded-control bg-primary-50 relative h-9 w-9 shrink-0 overflow-hidden">
                    {shop.logoPath ? (
                      <Image
                        src={shop.logoPath}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Store className="text-primary-700 h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </span>

                  <Link
                    href={`/admin/shops/${shop.id}`}
                    className="hover:text-primary min-w-0 flex-1 text-sm font-medium"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{pickLocale(shop.name, locale)}</span>
                      {shop.verifiedAt && (
                        <BadgeCheck className="text-primary h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {t('productCount', { count: formatNumber(shop.productCount, locale) })}
                    </span>
                  </Link>

                  {/* The unit is EDITABLE here and nowhere else (Prompt C11):
                      the mall assigns doors, and this is the screen that shows
                      the doors. */}
                  <UnitEditor shopId={shop.id} floor={floor.floor} unitNumber={shop.unitNumber} />

                  <span
                    className={cn(
                      'rounded-pill shrink-0 px-2 py-0.5 text-2xs font-semibold',
                      shop.status === 'approved'
                        ? 'bg-success-50 text-success-700'
                        : shop.status === 'pending'
                          ? 'bg-accent-warm/15 text-neutral-800'
                          : 'bg-neutral-100 text-neutral-600',
                    )}
                  >
                    {t(`status.${shop.status}` as never)}
                  </span>

                  <span className="w-28 shrink-0 text-end text-sm font-semibold tabular-nums">
                    {formatCurrency(shop.revenue, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-sm font-bold' : 'font-semibold')}>
        {value}
      </dd>
    </div>
  );
}
