import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PackagePlus, Upload } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { ProductTable } from '@/components/dashboard/products/product-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShopSearchBox } from '@/components/shop/shop-search-box';
import { requireShopkeeper } from '@/lib/auth/guards';
import { hasTranslation, pickLocale } from '@/lib/db/localized';
import { shopCatalogue, shopCatalogueCounts } from '@/lib/db/queries/shop-products';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = {
  q?: string;
  status?: 'draft' | 'published' | 'unpublished';
  stock?: 'out' | 'low';
};

/** Shopkeeper product list (PRD §6.2). */
export default async function ShopProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopProducts');

  const counts = await shopCatalogueCounts(user.shopId);

  const chips = [
    {
      key: 'all',
      href: '/dashboard/products',
      count: counts.all,
      active: !query.status && !query.stock,
    },
    {
      key: 'published',
      href: '/dashboard/products?status=published',
      count: counts.published,
      active: query.status === 'published',
    },
    {
      key: 'draft',
      href: '/dashboard/products?status=draft',
      count: counts.draft,
      active: query.status === 'draft',
    },
    {
      key: 'unpublished',
      href: '/dashboard/products?status=unpublished',
      count: counts.unpublished,
      active: query.status === 'unpublished',
    },
    {
      key: 'outOfStock',
      href: '/dashboard/products?stock=out',
      count: counts.outOfStock,
      active: query.stock === 'out',
    },
    {
      key: 'lowStock',
      href: '/dashboard/products?stock=low',
      count: counts.lowStock,
      active: query.stock === 'low',
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/products/import">
              <Upload />
              {t('import')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/products/new">
              <PackagePlus />
              {t('addProduct')}
            </Link>
          </Button>
        </div>
      </div>

      <ShopSearchBox placeholder={t('searchPlaceholder')} />

      <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
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

      <Suspense fallback={<ListSkeleton />}>
        <ProductList shopId={user.shopId} locale={locale} query={query} />
      </Suspense>
    </div>
  );
}

async function ProductList({
  shopId,
  locale,
  query,
}: {
  shopId: string;
  locale: string;
  query: Query;
}) {
  const t = await getTranslations('shopProducts');

  const items = await shopCatalogue({
    shopId,
    locale,
    search: query.q,
    status: query.status,
    stock: query.stock,
  });

  if (items.length === 0) {
    return (
      <EmptyState
        illustration={<PackagePlus className="h-7 w-7" />}
        title={query.q ? t('noMatchTitle', { term: query.q }) : t('emptyTitle')}
        description={query.q ? t('noMatchBody') : t('emptyBody')}
        action={{ label: t('addProduct'), href: '/dashboard/products/new' }}
      />
    );
  }

  return (
    <ProductTable
      rows={items.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: pickLocale(item.title, locale),
        categoryName: item.categoryName ? pickLocale(item.categoryName, locale) : null,
        price: item.price,
        discountPrice: item.discountPrice,
        stock: item.stock,
        status: item.status,
        viewCount: item.viewCount,
        wishlistCount: item.wishlistCount,
        imagePath: item.imagePath,
        missingEnglish: !hasTranslation(item.title, 'en'),
      }))}
    />
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="rounded-card border-border bg-card flex gap-3 border p-3">
          <Skeleton className="rounded-control h-16 w-16 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}
