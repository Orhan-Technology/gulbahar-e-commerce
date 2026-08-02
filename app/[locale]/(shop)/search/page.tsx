import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LayoutGrid, SearchX, Store } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SectionHeader } from '@/components/custom/section-header';
import { FacetControls } from '@/components/shop/listing/facet-controls';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { HeaderSearch } from '@/components/shop/search/header-search';
import { ShopGrid, ShopGridSkeleton } from '@/components/shop/shop-grid';
import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { filterFacets } from '@/lib/db/queries/listing';
import { trendingProducts } from '@/lib/db/queries/products';
import { categoryTree } from '@/lib/db/queries/shops';
import {
  searchCategories,
  searchCorrection,
  searchShops,
  searchTermMatchCounts,
} from '@/lib/db/queries/search';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Search results (PRD §5.1, §5.2). Products by default with a tab for shops.
 *
 * Tabs are links rather than client state so each tab is its own URL — shareable,
 * and the results stay server-rendered.
 *
 * THE FIELD IS ON THE PAGE, not only in the header. The header's pill is
 * `sm:block`, so on a phone the only route to search was the tab bar's
 * magnifier — which landed here, on a screen that had no input on it either.
 * There was literally nowhere to type a query on a 390px viewport. It stays
 * visible at every width because this is the one screen whose subject IS the
 * query, and refining a search from the results is the commonest thing a
 * shopper does next.
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

  const [facets, tree] = await Promise.all([
    filterFacets(locale, { query, scope: { search: term || undefined } }),
    categoryTree(locale),
  ]);
  const facetOptions = { ...facets, categories: tree };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{term ? t('resultsFor', { term }) : t('title')}</h1>

      <HeaderSearch
        variant="pill"
        className="max-w-3xl"
        initialQuery={term}
        // Only into an empty search page. Focusing the field when results are
        // already on screen would scroll a phone straight past them.
        autoFocus={term.length === 0}
      />

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
          <div className="min-w-0 space-y-4">
            {/* ONE boundary around the notice and the grid. The notice sits
                above the results, so resolving it separately would push the
                whole grid down a moment after it arrived — a shift on the
                screen a shopper is already reading. */}
            <Suspense fallback={<ProductListingSkeleton />}>
              <SpellingNotice term={term} locale={locale} />
              <ProductListing
                query={query}
                locale={locale}
                facets={facetOptions}
                scope={{ search: term }}
                promotedSlot="search_top"
                emptyHref={`/search?q=${encodeURIComponent(term)}`}
                emptyExtra={<ZeroResultRecovery term={term} locale={locale} />}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Showing near matches for X" (PRD §12.3).
 *
 * Trigram tolerance was completely silent: a shopper who mistyped got the right
 * products back and no way to know whether the engine understood them or simply
 * got lucky. Naming what it matched makes the tolerance legible — and gives
 * them the corrected term as a link, so a wrong guess costs one tap rather than
 * a retype.
 */
async function SpellingNotice({ term, locale }: { term: string; locale: string }) {
  const t = await getTranslations('search');
  const matches = await searchTermMatchCounts(term);

  /*
   * ONLY when tolerance actually did the work.
   *
   * An exact hit means the term was understood, and a "did you mean" over a
   * good result set is a system second-guessing a shopper who was right —
   * every marketplace that does this trains people to ignore the line entirely.
   * Nothing matched at all is the empty state's job, not this one's: "showing
   * the closest results" printed over an empty grid is a second thing gone
   * wrong on a screen that already went wrong once.
   */
  if (matches.exact > 0 || matches.total === 0) return null;

  const correction = await searchCorrection(term, locale);

  return (
    <div className="rounded-card border-border bg-neutral-50 px-3 py-2 text-sm">
      <p className="text-muted-foreground">{t('nearMatchesFor', { term })}</p>
      {correction && (
        <p className="mt-0.5">
          {t.rich('didYouMean', {
            term: correction,
            link: (chunks) => (
              <Link
                href={`/search?q=${encodeURIComponent(correction)}`}
                className="text-primary font-semibold hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  );
}

/**
 * What to offer when the grid is empty (PRD §5.2).
 *
 * A zero-result search used to end at an illustration and a "browse everything"
 * button, which is the same answer for every failed query. Nearly all of them
 * are recoverable: the term names an AISLE or a SHOP that does exist and simply
 * is not any product's title. So the categories and shops that match come
 * first, with their real counts, and the popular grid — whose own comment
 * already claimed it rendered here — sits underneath as the last resort.
 */
async function ZeroResultRecovery({ term, locale }: { term: string; locale: string }) {
  const t = await getTranslations('search');
  const [categories, shops] = await Promise.all([
    searchCategories(term, { limit: 6 }),
    searchShops(term, { limit: 4 }),
  ]);

  return (
    <div className="space-y-8">
      {categories.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold">{t('tryCategories')}</h2>
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="rounded-pill border-border bg-card hover:border-primary hover:text-primary inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-colors duration-150"
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{pickLocale(category.name, locale)}</span>
                  <span className="text-2xs text-neutral-500 tabular-nums">
                    {t('categoryHasCount', {
                      count: formatNumber(category.productCount, locale),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shops.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold">{t('tryShops')}</h2>
          <ul className="flex flex-wrap gap-2">
            {shops.map((shop) => (
              <li key={shop.id}>
                <Link
                  href={`/shops/${shop.slug}`}
                  className="rounded-pill border-border bg-card hover:border-primary hover:text-primary inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-colors duration-150"
                >
                  <Store className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{pickLocale(shop.name, locale)}</span>
                  <span className="text-2xs text-neutral-500 tabular-nums">
                    {t('categoryHasCount', {
                      count: formatNumber(shop.productCount, locale),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PopularFallback locale={locale} heading={t('popularTitle')} />
    </div>
  );
}

async function ShopResults({ term }: { term: string }) {
  // The clock is read here, on the server: ShopGrid takes `now` as a prop
  // rather than calling new Date() itself, which React 19 forbids during render.
  const now = new Date();
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

  return <ShopGrid items={results} now={now} />;
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
