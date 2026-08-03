import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PackagePlus, Upload } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { ChipScroller } from '@/components/dashboard/chip-scroller';
import { ProductTable } from '@/components/dashboard/products/product-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchBox } from '@/components/custom/search-box';
import { requireShopkeeper } from '@/lib/auth/guards';
import { hasTranslation, pickLocale } from '@/lib/db/localized';
import { shopCatalogue, shopCatalogueCounts } from '@/lib/db/queries/shop-products';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = {
  q?: string;
  status?: 'draft' | 'published' | 'unpublished' | 'archived';
  stock?: 'out' | 'low';
  /** Arrives from the dashboard's "views this week" tile. */
  sort?: 'title' | 'views';
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

  /*
   * The archive chip appears only once something is IN the archive. A shop that
   * has never deleted a product has no use for a permanently visible "archived
   * (۰)" filter — the point of archiving is that those rows are out of the way,
   * and a chip advertising an empty drawer puts them back in the eyeline.
   */
  if (counts.archived > 0) {
    chips.push({
      key: 'archived',
      href: '/dashboard/products?status=archived',
      count: counts.archived,
      active: query.status === 'archived',
    });
  }

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

      <SearchBox placeholder={t('searchPlaceholder')} />

      {/* The row scrolls, and the SELECTED chip is scrolled to — `?status=archived`
          put the active chip seventh in a six-chip viewport at 390px, so the
          screen showed a filtered catalogue with nothing on it explaining the
          filter. See chip-scroller.tsx. */}
      <ChipScroller className="flex gap-2 pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            data-chip-active={chip.active}
            aria-current={chip.active ? 'page' : undefined}
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
      </ChipScroller>

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
    sort: query.sort === 'views' ? 'views' : 'title',
  });

  if (items.length === 0) {
    // An empty ARCHIVE is a good state, not a shop with no products — offering
    // "add your first product" there would answer a question nobody asked.
    if (query.status === 'archived') {
      return (
        <EmptyState
          illustration={<PackagePlus className="h-7 w-7" />}
          title={t('archive.emptyTitle')}
          description={t('archive.emptyBody')}
          action={{ label: t('archive.backToCatalogue'), href: '/dashboard/products' }}
        />
      );
    }

    return (
      <EmptyState
        illustration={<PackagePlus className="h-7 w-7" />}
        title={query.q ? t('noMatchTitle', { term: query.q }) : t('emptyTitle')}
        description={query.q ? t('noMatchBody') : t('emptyBody')}
        action={{ label: t('addProduct'), href: '/dashboard/products/new' }}
        // The alternative, not a lesser version of the same thing: a shop with
        // sixty lines in a spreadsheet should not type them one at a time.
        secondaryAction={
          query.q ? undefined : { label: t('emptyImport'), href: '/dashboard/products/import' }
        }
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
        unpublishReason: item.unpublishReason,
        viewCount: item.viewCount,
        weekViews: item.weekViews,
        wishlistCount: item.wishlistCount,
        imagePath: item.imagePath,
        missingEnglish: !hasTranslation(item.title, 'en'),
      }))}
      // The eye figure switches to the seven-day count when the shopkeeper
      // arrived from the dashboard's demand tile, so the ranking they are
      // reading and the number beside each row are the same measure.
      viewWindow={query.sort === 'views' ? 'week' : 'all'}
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
