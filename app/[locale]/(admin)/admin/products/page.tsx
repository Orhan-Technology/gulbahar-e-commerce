import { Suspense } from 'react';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Eye, ImageOff, Package } from 'lucide-react';

import { ProductRowActions } from '@/components/admin/product-row-actions';
import { EmptyState } from '@/components/custom/empty-state';
import { PriceDisplay } from '@/components/custom/price-display';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminProducts, adminShopOptions } from '@/lib/db/queries/admin';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = { shop?: string; status?: 'draft' | 'published' | 'unpublished'; q?: string };

/**
 * Cross-platform product list (PRD §7.2).
 *
 * Read plus unpublish, and nothing else — there is no edit affordance anywhere on
 * this page, because admin never edits shop content (PRD §3.1). The shop name on
 * every row links to that shop, since "who is selling this" is the question that
 * usually follows.
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

  const shops = await adminShopOptions(locale);

  const statusChips = [
    { key: 'all', href: '/admin/products', active: !query.status },
    ...(['published', 'draft', 'unpublished'] as const).map((status) => ({
      key: status,
      href: `/admin/products?status=${status}`,
      active: query.status === status,
    })),
  ];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusChips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium ${
              chip.active
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t(`filters.${chip.key}`)}
          </Link>
        ))}
      </div>

      {/* Shop filter as links rather than a select: it is also the deep-link target
          from the shops directory. */}
      <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
        <Link
          href={query.status ? `/admin/products?status=${query.status}` : '/admin/products'}
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
            href={`/admin/products?shop=${shop.id}${query.status ? `&status=${query.status}` : ''}`}
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
  const rows = await adminProducts({
    locale,
    shopId: query.shop,
    status: query.status,
    search: query.q,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<Package className="h-7 w-7" />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  return (
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
              <Badge variant={row.status === 'published' ? 'success' : 'secondary'}>
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
