import { Suspense } from 'react';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MapPin, Phone, Plus, Store } from 'lucide-react';

import { CreateShopDialog } from '@/components/admin/create-shop-dialog';
import { ShopActions } from '@/components/admin/shop-actions';
import { EmptyState } from '@/components/custom/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminShopDirectory } from '@/lib/db/queries/admin';
import { categoryTree, shopCountsByStatus } from '@/lib/db/queries/shops';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import type { ShopStatus } from '@/lib/db/schema';

type Query = { status?: ShopStatus; q?: string };

const STATUS_BADGE: Record<ShopStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  approved: 'success',
  pending: 'warning',
  suspended: 'secondary',
  closed: 'destructive',
};

/** Shop directory and pending queue (PRD §7.1). */
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

  const chips = [
    { key: 'all', href: '/admin/shops', count: total, active: !query.status },
    ...(['pending', 'approved', 'suspended', 'closed'] as const).map((status) => ({
      key: status,
      href: `/admin/shops?status=${status}`,
      count: counts[status] ?? 0,
      active: query.status === status,
    })),
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{t('title')}</h1>
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
      </div>

      {/* The pending queue is the live-demo moment, so it gets a standing note
          rather than looking like just another filter. */}
      {query.status === 'pending' && (counts.pending ?? 0) > 0 && (
        <p className="rounded-card border-warning-border bg-warning-bg text-warning p-3 text-xs">
          {t('pendingNote')}
        </p>
      )}

      <Suspense key={`${query.status ?? 'all'}-${query.q ?? ''}`} fallback={<ShopListSkeleton />}>
        <ShopList locale={locale} query={query} />
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
                  {shop.phone}
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
