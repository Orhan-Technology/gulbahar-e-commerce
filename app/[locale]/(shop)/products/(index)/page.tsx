import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { FacetControls } from '@/components/shop/listing/facet-controls';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { filterFacets } from '@/lib/db/queries/listing';
import { categoryTree } from '@/lib/db/queries/shops';

export type { ListingSearchParams as ProductSearchParams };

/**
 * Everything, listed (PRD §5.1).
 *
 * The plainest use of the shared listing: no scope at all, every facet
 * available. Category pages, search and a shop's own catalogue are the same
 * screen with one axis fixed — see components/shop/listing/product-listing.tsx.
 */
export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ListingSearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('products');

  // `query` goes in so every facet option can carry the count it would return —
  // computed with its own axis excluded, see filterFacets.
  const [facets, tree] = await Promise.all([
    filterFacets(locale, { query }),
    categoryTree(locale),
  ]);
  const facetOptions = { ...facets, categories: tree };

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Desktop rail only. Below lg the same controls open in the toolbar's
            bottom sheet — one implementation, rendered twice. */}
        <aside className="hidden lg:block">
          <FacetControls {...facetOptions} />
        </aside>

        <div className="min-w-0">
          <Suspense fallback={<ProductListingSkeleton />}>
            <ProductListing
              query={query}
              locale={locale}
              facets={facetOptions}
              emptyHref="/products"
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
