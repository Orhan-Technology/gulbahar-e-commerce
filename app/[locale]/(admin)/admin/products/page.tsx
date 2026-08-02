import { Suspense } from 'react';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Eye, ImageOff, Package } from 'lucide-react';

import { ListCapNotice } from '@/components/admin/list-cap-notice';
import { ProductRowActions } from '@/components/admin/product-row-actions';
import { EmptyState } from '@/components/custom/empty-state';
import { PriceDisplay } from '@/components/custom/price-display';
import { SearchBox } from '@/components/custom/search-box';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import {
  adminProductStatusCounts,
  adminProducts,
  adminShopOptions,
  type AdminProductStatusFilter,
} from '@/lib/db/queries/admin';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = { shop?: string; status?: AdminProductStatusFilter; q?: string };

const ROW_LIMIT = 100;

/**
 * The status chips.
 *
 * `archived` is a SHOPKEEPER'S DELETE, so it is last and it is out of "all" —
 * the query excludes it from every unfiltered view. It is still reachable,
 * because "the shop says they never listed that" is answerable only if the row
 * can be found; what it never gets is an unpublish button, since the listing is
 * already gone and republishing it would be the mall overruling a catalogue
 * decision that is not its own (PRD §3.1).
 */
const STATUS_FILTERS = ['published', 'draft', 'unpublished', 'archived'] as const;

/**
 * Cross-platform product list (PRD §7.2).
 *
 * Read plus unpublish, and nothing else — there is no edit affordance anywhere on
 * this page, because admin never edits shop content (PRD §3.1). The shop name on
 * every row links to that shop, since "who is selling this" is the question that
 * usually follows.
 *
 * THE SEARCH BOX IS NEW and the capability was not: `adminProducts` has always
 * accepted `?q=`, and there was nothing on the screen that could write it. A
 * filter reachable only by editing the URL is a filter that does not exist.
 */
export default async function AdminProductsPage({
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
  const t = await getTranslations('adminProducts');

  const [shops, counts] = await Promise.all([
    adminShopOptions(locale),
    adminProductStatusCounts(query.shop),
  ]);

  // Search, status and shop all survive each other: narrowing on one axis must
  // not silently drop the other two.
  const hrefWith = (patch: Partial<Record<keyof Query, string | undefined>>) => {
    const merged = { ...query, ...patch };
    const next = new URLSearchParams();
    for (const key of ['status', 'shop', 'q'] as const) {
      const value = merged[key];
      if (value) next.set(key, String(value));
    }
    const search = next.toString();
    return search ? `/admin/products?${search}` : '/admin/products';
  };

  const statusChips = [
    { key: 'all', href: hrefWith({ status: undefined }), count: counts.all, active: !query.status },
    ...STATUS_FILTERS.map((status) => ({
      key: status,
      href: hrefWith({ status }),
      count: counts[status],
      active: query.status === status,
    })),
  ];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <SearchBox placeholder={t('searchPlaceholder')} />

      <div className="flex flex-wrap gap-2">
        {statusChips.map((chip) => (
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

      {/* Shop filter as links rather than a select: it is also the deep-link target
          from the shops directory. */}
      <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
        <Link
          href={hrefWith({ shop: undefined })}
          className={`rounded-pill shrink-0 border px-3 py-1 text-xs ${
            !query.shop
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-border bg-card hover:border-primary'
          }`}
        >
          {t('allShops')}
        </Link>
        {shops.map((shop) => (
          <Link
            key={shop.id}
            href={hrefWith({ shop: shop.id })}
            className={`rounded-pill shrink-0 border px-3 py-1 text-xs ${
              query.shop === shop.id
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {pickLocale(shop.name, locale)}
          </Link>
        ))}
      </div>

      <Suspense
        key={`${query.shop ?? ''}-${query.status ?? ''}-${query.q ?? ''}`}
        fallback={<ProductListSkeleton />}
      >
        <ProductList locale={locale} query={query} />
      </Suspense>
    </div>
  );
}

async function ProductList({ locale, query }: { locale: string; query: Query }) {
  const t = await getTranslations('adminProducts');
  // One extra row, purely to tell the caption whether the list is capped.
  const fetched = await adminProducts({
    locale,
    shopId: query.shop,
    status: query.status,
    search: query.q,
    limit: ROW_LIMIT + 1,
  });
  const rows = fetched.slice(0, ROW_LIMIT);
  const hasMore = fetched.length > ROW_LIMIT;

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<Package className="h-7 w-7" />}
        title={query.q ? t('emptySearchTitle') : t('emptyTitle')}
        description={query.q ? t('emptySearchBody', { term: query.q }) : t('emptyBody')}
      />
    );
  }

  return (
    <>
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-card border-border bg-card flex flex-wrap items-center gap-4 border p-3"
        >
          <span className="rounded-control relative h-14 w-14 shrink-0 overflow-hidden bg-neutral-100">
            {row.imagePath ? (
              <Image src={row.imagePath} alt="" fill sizes="56px" className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-neutral-400">
                <ImageOff className="h-5 w-5" aria-hidden />
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* Links to the PUBLIC page, not an editor — there is no editor. */}
              <Link
                href={`/products/${row.slug}`}
                target="_blank"
                className="hover:text-primary clamp-1 text-sm font-medium"
              >
                {pickLocale(row.title, locale)}
              </Link>
              {/* Archived is the shop's own delete, so it is destructive-toned
                  rather than the neutral grey a draft gets — an admin scanning
                  this list has to be able to see that the row is a tombstone. */}
              <Badge
                variant={
                  row.status === 'published'
                    ? 'success'
                    : row.status === 'archived'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {t(`filters.${row.status}`)}
              </Badge>
              {row.shopStatus !== 'approved' && (
                <Badge variant="warning">{t('shopNotApproved')}</Badge>
              )}
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Link href={`/admin/shops/${row.shopId}`} className="hover:text-primary">
                {pickLocale(row.shopName, locale)}
              </Link>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" aria-hidden />
                {formatNumber(row.viewCount, locale)}
              </span>
              <span>{t('stock', { count: formatNumber(row.stock, locale) })}</span>
            </div>
          </div>

          <PriceDisplay price={row.price} discountPrice={row.discountPrice} size="sm" />

          <ProductRowActions productId={row.id} status={row.status} />
        </li>
      ))}
    </ul>

    <div className="pt-3">
      <ListCapNotice shown={rows.length} hasMore={hasMore} />
    </div>
    </>
  );
}

function ProductListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="rounded-card border-border bg-card flex gap-4 border p-3">
          <Skeleton className="rounded-control h-14 w-14 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20" />
        </li>
      ))}
    </ul>
  );
}
