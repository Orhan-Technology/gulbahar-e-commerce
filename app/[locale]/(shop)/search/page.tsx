import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchX } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SectionHeader } from '@/components/custom/section-header';
import { FacetControls } from '@/components/shop/listing/facet-controls';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { ShopGrid, ShopGridSkeleton } from '@/components/shop/shop-grid';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { filterFacets } from '@/lib/db/queries/listing';
import { trendingProducts } from '@/lib/db/queries/products';
import { categoryTree } from '@/lib/db/queries/shops';
import { searchShops } from '@/lib/db/queries/search';
import { Link } from '@/lib/i18n/navigation';

/**
 * Search results (PRD §5.1, §5.2). Products by default with a tab for shops.
 *
 * Tabs are links rather than client state so each tab is its own URL — shareable,
 * and the results stay server-rendered.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ListingSearchParams & { tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('search');

  const term = query.q?.trim() ?? '';
  const activeTab = query.tab === 'shops' ? 'shops' : 'products';

  const [facets, tree] = await Promise.all([filterFacets(locale), categoryTree(locale)]);
  const facetOptions = { ...facets, categories: tree };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{term ? t('resultsFor', { term }) : t('title')}</h1>

      {term && (
        <div role="tablist" className="border-border flex gap-2 border-b">
          {(['products', 'shops'] as const).map((value) => (
            <Link
              key={value}
              role="tab"
              aria-selected={activeTab === value}
              href={`/search?q=${encodeURIComponent(term)}${value === 'shops' ? '&tab=shops' : ''}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                activeTab === value
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              {t(value)}
            </Link>
          ))}
        </div>
      )}

      {!term ? (
        <Suspense fallback={<ProductGridSkeleton count={10} />}>
          <PopularFallback locale={locale} heading={t('popularTitle')} />
        </Suspense>
      ) : activeTab === 'shops' ? (
        <Suspense fallback={<ShopGridSkeleton />}>
          <ShopResults term={term} />
        </Suspense>
      ) : (
        /*
          Search results are a LISTING, with the same facets, chips, sort and
          load-more as every other one. It used to be its own screen with its
          own query and no filters at all — which meant the one place a shopper
          most often lands was the one place they could not narrow.
        */
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <FacetControls {...facetOptions} />
          </aside>
          <div className="min-w-0">
            <Suspense fallback={<ProductListingSkeleton />}>
              <ProductListing
                query={query}
                locale={locale}
                facets={facetOptions}
                scope={{ search: term }}
                promotedSlot="search_top"
                emptyHref={`/search?q=${encodeURIComponent(term)}`}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

async function ShopResults({ term }: { term: string }) {
  const t = await getTranslations('search');
  const results = await searchShops(term, { limit: 24 });

  if (results.length === 0) {
    return (
      <EmptyState
        illustration={<SearchX className="h-7 w-7" />}
        title={t('noShopsTitle', { term })}
        description={t('noShopsBody')}
        action={{ label: t('allShops'), href: '/shops' }}
      />
    );
  }

  return <ShopGrid items={results} />;
}

/** Popular products, shown for an empty query and beneath a zero-result search. */
async function PopularFallback({ locale, heading }: { locale: string; heading: string }) {
  const [items, user] = await Promise.all([trendingProducts(locale, 10), currentUser()]);
  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  return (
    <section className="space-y-3">
      <SectionHeader title={heading} href="/products" />
      <ProductGrid items={items} savedIds={saved} />
    </section>
  );
}
