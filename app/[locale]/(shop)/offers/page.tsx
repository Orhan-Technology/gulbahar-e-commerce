import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';

import { OffersStrip, OffersStripSkeleton } from '@/components/shop/home/offers-strip';
import { FacetControls } from '@/components/shop/listing/facet-controls';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { filterFacets } from '@/lib/db/queries/listing';
import { categoryTree } from '@/lib/db/queries/shops';

/**
 * Offers page (PRD §4, §5.1). Shop-funded discounts, so no Sponsored badge —
 * these cost the shop margin rather than buying position (PRD §8.1).
 */
export default async function OffersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ListingSearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('offers');

  const [facets, tree] = await Promise.all([filterFacets(locale), categoryTree(locale)]);
  const facetOptions = { ...facets, categories: tree };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 sm:py-6">
      <div>
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>

      <Suspense fallback={<OffersStripSkeleton />}>
        <OffersStrip />
      </Suspense>

      {/*
        The discounted grid is the same listing as everywhere else, permanently
        scoped to `onOffer`. It used to be a bare twenty-four-card grid with no
        sort and no filters — on the one page where "cheapest first" is the
        obvious next thing a shopper wants.
      */}
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <FacetControls {...facetOptions} />
        </aside>
        <div className="min-w-0">
          <Suspense fallback={<ProductListingSkeleton />}>
            <ProductListing
              query={{ ...query, onOffer: '1' }}
              locale={locale}
              facets={facetOptions}
              emptyHref="/offers"
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
