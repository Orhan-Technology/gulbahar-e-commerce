import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PackageSearch } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { ProductFilters } from '@/components/shop/filters/product-filters';
import { SortSelect } from '@/components/shop/filters/sort-select';
import { PaginationBar } from '@/components/shop/pagination-bar';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { filterFacets, promotedProductsForSlot, shopIdsBySlug } from '@/lib/db/queries/listing';
import { productList, type ProductSort } from '@/lib/db/queries/products';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { categoryBySlug, categoryTree } from '@/lib/db/queries/shops';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { decodeSlug } from '@/lib/utils';
import type { ProductSearchParams } from '../../products/page';

const SORTS: ProductSort[] = ['newest', 'price_asc', 'price_desc', 'rating'];

/**
 * Category listing (PRD §5.1). Reuses the same filter rail and grid as /products;
 * the category is locked so the rail cannot navigate out of the page it belongs to.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<ProductSearchParams>;
}) {
  const { locale, slug: rawSlug } = await params;
  // Non-ASCII slugs arrive percent-encoded (see decodeSlug).
  const slug = decodeSlug(rawSlug);
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('categories');

  const category = await categoryBySlug(slug);
  if (!category) notFound();

  const [facets, tree] = await Promise.all([filterFacets(locale), categoryTree(locale)]);
  const children = tree.find((parent) => parent.slug === slug)?.children ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <nav className="text-muted-foreground text-xs">
        <Link href="/categories" className="hover:text-primary">
          {t('title')}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">{pickLocale(category.name, locale)}</span>
      </nav>

      <h1 className="mt-1 text-xl font-bold">{pickLocale(category.name, locale)}</h1>

      {children.length > 0 && (
        <div className="mt-3 flex scrollbar-none gap-2 overflow-x-auto pb-1">
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/categories/${child.slug}`}
              className="rounded-pill border-border bg-card hover:border-primary hover:text-primary shrink-0 border px-3 py-1.5 text-xs font-medium"
            >
              {pickLocale(child.name, locale)}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[240px_1fr]">
        <ProductFilters
          shops={facets.shops}
          categories={tree}
          priceMin={facets.priceMin}
          priceMax={facets.priceMax}
          lockedCategory={slug}
        />

        <div className="min-w-0 space-y-4">
          <Suspense fallback={<ProductGridSkeleton count={12} />}>
            <CategoryResults categoryId={category.id} query={query} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function CategoryResults({
  categoryId,
  query,
  locale,
}: {
  categoryId: string;
  query: ProductSearchParams;
  locale: string;
}) {
  const t = await getTranslations('products');
  const shopSlugs = Array.isArray(query.shop) ? query.shop : query.shop ? [query.shop] : [];
  const shopIds = await shopIdsBySlug(shopSlugs);
  const sort = (SORTS.includes(query.sort as ProductSort) ? query.sort : 'newest') as ProductSort;
  const page = Math.max(1, Number(query.page ?? 1) || 1);

  const [result, promoted, user] = await Promise.all([
    productList({
      locale,
      categoryId,
      shopIds: shopIds.length > 0 ? shopIds : undefined,
      priceMin: query.priceMin ? Number(query.priceMin) : undefined,
      priceMax: query.priceMax ? Number(query.priceMax) : undefined,
      minRating: query.minRating ? Number(query.minRating) : undefined,
      inStockOnly: query.inStock === '1',
      sort,
      page,
    }),
    page === 1 ? promotedProductsForSlot('category_top', { categoryId }) : Promise.resolve([]),
    currentUser(),
  ]);

  const promotedIds = new Set(promoted.map((item) => item.id));
  const organic = result.items.filter((item) => !promotedIds.has(item.id));
  const saved = await wishlistedProductIds(user?.id, [
    ...promoted.map((i) => i.id),
    ...organic.map((i) => i.id),
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
        </p>
        <SortSelect />
      </div>

      {promoted.length > 0 && (
        <section className="rounded-card border-accent-200 bg-accent-50/40 space-y-2 border p-3">
          <div className="flex items-center gap-2">
            <SponsoredBadge />
            <span className="text-accent-800 text-xs">{t('promotedNote')}</span>
          </div>
          <ProductGrid
            items={promoted.map((i) => ({ ...i, sponsored: true }))}
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
