import { Suspense } from 'react';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeartPulse, MapPin, Phone, Plus, Store } from 'lucide-react';

import { CreateShopDialog } from '@/components/admin/create-shop-dialog';
import { ShopHealthList } from '@/components/admin/shop-health-list';
import { RangeControl } from '@/components/console/range-control';
import { ShopActions } from '@/components/admin/shop-actions';
import { EmptyState } from '@/components/custom/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { parseConsoleRange, type ConsoleRangeKey } from '@/lib/console-range';
import { pickLocale } from '@/lib/db/localized';
import { adminShopDirectory } from '@/lib/db/queries/admin';
import { categoryTree, shopCountsByStatus } from '@/lib/db/queries/shops';
import { formatNumber, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import type { ShopStatus } from '@/lib/db/schema';

type Query = { status?: ShopStatus; q?: string; view?: string; range?: ConsoleRangeKey };

const STATUS_BADGE: Record<ShopStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  approved: 'success',
  pending: 'warning',
  suspended: 'secondary',
  closed: 'destructive',
};

/**
 * Shop directory, pending queue, and shop health (PRD §7.1, Prompt C9).
 *
 * TWO VIEWS OF ONE LIST, not two pages. The directory answers "who is in the
 * mall"; health answers "who should I call today". They are the same tenants
 * asked a different question, and splitting them into separate routes would put
 * a nav item between an admin and the only screen on this console that tells
 * them what to do without being asked.
 *
 * The health view carries the console date range, because "slow to accept" is
 * a statement about a period and a flag with no window behind it is an opinion.
 */
export default async function AdminShopsPage({
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
  const t = await getTranslations('adminShops');

  const [counts, tree] = await Promise.all([shopCountsByStatus(), categoryTree(locale)]);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const health = query.view === 'health';
  const range = parseConsoleRange(query.range);

  const chips = [
    { key: 'all', href: '/admin/shops', count: total, active: !query.status && !health },
    ...(['pending', 'approved', 'suspended', 'closed'] as const).map((status) => ({
      key: status,
      href: `/admin/shops?status=${status}`,
      count: counts[status] ?? 0,
      active: !health && query.status === status,
    })),
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{t('title')}</h1>
        {health && <RangeControl current={range.key} />}
        <CreateShopDialog
          categories={tree.map((root) => ({
            id: root.id,
            label: pickLocale(root.name, locale) ?? root.slug,
          }))}
          trigger={
            <Button size="sm">
              <Plus />
              {t('createShop')}
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
              chip.active
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t(`filters.${chip.key}`)}
            <Badge variant={chip.active ? 'default' : 'secondary'}>
              {formatNumber(chip.count, locale)}
            </Badge>
          </Link>
        ))}

        {/* Separated from the status chips by a divider: it filters a different
            axis, and sitting flush against them would read as a sixth status. */}
        <span className="bg-border mx-1 w-px self-stretch" aria-hidden />

        <Link
          href="/admin/shops?view=health"
          data-shops-view="health"
          className={`rounded-pill flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
            health
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-border bg-card hover:border-primary'
          }`}
        >
          <HeartPulse className="h-3.5 w-3.5" aria-hidden />
          {t('health.viewLabel')}
        </Link>
      </div>

      {/* The pending queue is the live-demo moment, so it gets a standing note
          rather than looking like just another filter. */}
      {query.status === 'pending' && (counts.pending ?? 0) > 0 && (
        <p className="rounded-card border-warning-border bg-warning-bg text-warning p-3 text-xs">
          {t('pendingNote')}
        </p>
      )}

      <Suspense
        key={`${health ? 'health' : query.status ?? 'all'}-${query.q ?? ''}-${range.key}`}
        fallback={<ShopListSkeleton />}
      >
        {health ? <ShopHealthList days={range.days} /> : <ShopList locale={locale} query={query} />}
      </Suspense>
    </div>
  );
}

async function ShopList({ locale, query }: { locale: string; query: Query }) {
  const t = await getTranslations('adminShops');
  const shops = await adminShopDirectory({ locale, status: query.status, search: query.q });

  if (shops.length === 0) {
    return (
      <EmptyState
        illustration={<Store className="h-7 w-7" />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {shops.map((shop) => (
        <li
          key={shop.id}
          className="rounded-card border-border bg-card flex flex-wrap items-start gap-4 border p-4"
        >
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-100">
            {shop.logoPath ? (
              <Image src={shop.logoPath} alt="" fill sizes="48px" className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-neutral-400">
                <Store className="h-5 w-5" aria-hidden />
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/shops/${shop.id}`}
                className="hover:text-primary text-sm font-bold"
              >
                {pickLocale(shop.name, locale)}
              </Link>
              <Badge variant={STATUS_BADGE[shop.status]}>{t(`filters.${shop.status}`)}</Badge>
              {shop.categoryName && (
                <span className="text-muted-foreground text-xs">
                  {pickLocale(shop.categoryName, locale)}
                </span>
              )}
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {shop.floor !== null && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {t('floorUnit', {
                    floor: formatNumber(shop.floor, locale),
                    unit: shop.unitNumber ?? '—',
                  })}
                </span>
              )}
              {shop.phone && (
                <span className="inline-flex items-center gap-1" dir="ltr">
                  <Phone className="h-3 w-3" aria-hidden />
                  {formatPhone(shop.phone, locale)}
                </span>
              )}
              <span>
                {t('productCounts', {
                  published: formatNumber(shop.publishedProducts, locale),
                  total: formatNumber(shop.totalProducts, locale),
                })}
              </span>
              {shop.ownerName && <span>{t('owner', { name: shop.ownerName })}</span>}
            </div>
          </div>

          <ShopActions shopId={shop.id} status={shop.status} size="sm" />
        </li>
      ))}
    </ul>
  );
}

function ShopListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="rounded-card border-border bg-card flex gap-4 border p-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="rounded-control h-8 w-24" />
        </li>
      ))}
    </ul>
  );
}
