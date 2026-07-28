import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PackageSearch } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { ProductFilters } from '@/components/shop/filters/product-filters';
import { SortSelect } from '@/components/shop/filters/sort-select';
import { PaginationBar } from '@/components/shop/pagination-bar';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { filterFacets, promotedProductsForSlot, shopIdsBySlug } from '@/lib/db/queries/listing';
import { productList, type ProductSort } from '@/lib/db/queries/products';
import { categoryBySlug, categoryTree } from '@/lib/db/queries/shops';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { formatNumber } from '@/lib/format';
import { pickLocale } from '@/lib/db/localized';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';

export type ProductSearchParams = {
  category?: string;
  shop?: string | string[];
  priceMin?: string;
  priceMax?: string;
  minRating?: string;
  inStock?: string;
  sort?: string;
  page?: string;
};

const SORTS: ProductSort[] = ['newest', 'price_asc', 'price_desc', 'rating'];

/**
 * Product listing (PRD §5.1).
 *
 * Filter state is read from searchParams, which is what keeps this a server
 * component: no client-side data fetching, and a filtered URL is shareable.
 */
export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ProductSearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('products');

  const [facets, tree] = await Promise.all([filterFacets(locale), categoryTree(locale)]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="space-y-4">
          <ProductFilters
            shops={facets.shops}
            categories={tree}
            priceMin={facets.priceMin}
            priceMax={facets.priceMax}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <Suspense fallback={<ResultsSkeleton />}>
            <Results query={query} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Results({ query, locale }: { query: ProductSearchParams; locale: string }) {
  const t = await getTranslations('products');

  const categorySlug = query.category;
  const category = categorySlug ? await categoryBySlug(categorySlug) : null;

  const shopSlugs = Array.isArray(query.shop) ? query.shop : query.shop ? [query.shop] : [];
  const shopIds = await shopIdsBySlug(shopSlugs);

  const sort = (SORTS.includes(query.sort as ProductSort) ? query.sort : 'newest') as ProductSort;
  const page = Math.max(1, Number(query.page ?? 1) || 1);

  const [result, promoted, user] = await Promise.all([
    productList({
      locale,
      categoryId: category?.id,
      shopIds: shopIds.length > 0 ? shopIds : undefined,
      priceMin: query.priceMin ? Number(query.priceMin) : undefined,
      priceMax: query.priceMax ? Number(query.priceMax) : undefined,
      minRating: query.minRating ? Number(query.minRating) : undefined,
      inStockOnly: query.inStock === '1',
      sort,
      page,
    }),
    // Paid strip only on page 1 — a shop bought placement above the results, not
    // above every page of them (PRD §8.4).
    page === 1 && category
      ? promotedProductsForSlot('category_top', { categoryId: category.id })
      : Promise.resolve([]),
    currentUser(),
  ]);

  const promotedIds = new Set(promoted.map((item) => item.id));
  // A promoted product must not appear twice on the same screen.
  const organic = result.items.filter((item) => !promotedIds.has(item.id));

  const saved = await wishlistedProductIds(user?.id, [
    ...promoted.map((item) => item.id),
    ...organic.map((item) => item.id),
  ]);

  if (result.total === 0) {
    return (
      <EmptyState
        illustration={<PackageSearch className="h-7 w-7" />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
        action={{ label: t('emptyAction'), href: '/products' }}
      />
    );
  }

  void recordImpressions(promoted.map((item) => item.campaignId));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t('resultCount', { count: formatNumber(result.total, locale) })}
          {category && ` · ${pickLocale(category.name, locale)}`}
        </p>
        <SortSelect />
      </div>

      {promoted.length > 0 && (
        <section className="rounded-card border-border bg-neutral-100/70 space-y-2 border p-3">
          <div className="flex items-center gap-2">
            <SponsoredBadge />
            <span className="text-xs text-neutral-600">{t('promotedNote')}</span>
          </div>
          <ProductGrid
            items={promoted.map((item) => ({ ...item, sponsored: true }))}
            savedIds={saved}
            priority
          />
        </section>
      )}

      <ProductGrid items={organic} savedIds={saved} priority={promoted.length === 0} />

      <PaginationBar page={result.page} pageCount={result.pageCount} />
    </>
  );
}

function ResultsSkeleton() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-44" />
      </div>
      <ProductGridSkeleton count={12} />
    </>
  );
}
