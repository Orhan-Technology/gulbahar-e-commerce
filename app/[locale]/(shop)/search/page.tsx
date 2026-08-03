import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LayoutGrid, SearchX, Store } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { FacetControls } from '@/components/shop/listing/facet-controls';
import { PopularFallback } from '@/components/shop/listing/popular-fallback';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { ProductGridSkeleton } from '@/components/shop/product-grid';
import { HeaderSearch } from '@/components/shop/search/header-search';
import { SearchDiscovery } from '@/components/shop/search/search-discovery';
import { ShopGrid, ShopGridSkeleton } from '@/components/shop/shop-grid';
import { pickLocale } from '@/lib/db/localized';
import { filterFacets } from '@/lib/db/queries/listing';
import { categoryTree } from '@/lib/db/queries/shops';
import {
  searchCategories,
  searchCorrection,
  searchShops,
  searchTermMatchCounts,
  trendingSearches,
} from '@/lib/db/queries/search';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

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
        /*
          THE EMPTY SEARCH PAGE IS A STARTING POINT, not a fallback grid. What
          this reader looked for before and what the mall is looking for now are
          the two shortest routes to a query, and both were locked inside the
          header field's dropdown — invisible on the one screen that exists to
          begin a search. The popular grid stays underneath as the browse-y
          answer for someone with neither.
        */
        <Suspense fallback={<ProductGridSkeleton count={10} />}>
          <SearchStart locale={locale} />
        </Suspense>
      ) : activeTab === 'shops' ? (
        <Suspense fallback={<ShopGridSkeleton />}>
          <ShopResults term={term} locale={locale} />
        </Suspense>
      ) : (
        /*
          Search results are a LISTING, with the same facets, chips, sort and
          load-more as every other one. It used to be its own screen with its
          own query and no filters at all — which meant the one place a shopper
          most often lands was the one place they could not narrow.
        */
        /*
          NO FILTER RAIL OVER A ZERO-RESULT SEARCH. Twenty facet groups beside
          an empty grid is a form asking somebody to narrow nothing — and every
          one of its rows reads «۰», which is the page repeating its own bad
          news two dozen times. `facets.total` is the count under every current
          narrowing, computed alongside the facet counts themselves, so the
          decision costs no extra query and the grid takes the full width.
        */
        <div
          className={cn(
            'grid gap-6',
            (facets.total ?? 0) > 0 && 'lg:grid-cols-[240px_1fr]',
          )}
        >
          {(facets.total ?? 0) > 0 && (
            <aside className="hidden lg:block">
              <FacetControls {...facetOptions} />
            </aside>
          )}
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

      <PopularFallback />
    </div>
  );
}

/**
 * The shops tab (PRD §5.1).
 *
 * IT STATES ITS OWN SIZE AND POINTS AT THE OTHER TAB. A bare grid of shop cards
 * answered neither "how many" nor "is the thing I want on the other tab" — and
 * the products tab is where a term like «کفش» has most of its answers, so a
 * reader who lands here on a two-shop match has no idea they are one tap from
 * six products. The hint is a link, and it carries the term.
 */
async function ShopResults({ term, locale }: { term: string; locale: string }) {
  // The clock is read here, on the server: ShopGrid takes `now` as a prop
  // rather than calling new Date() itself, which React 19 forbids during render.
  const now = new Date();
  const t = await getTranslations('search');
  const [results, productMatches] = await Promise.all([
    searchShops(term, { limit: 24 }),
    searchTermMatchCounts(term),
  ]);

  const crossTab =
    productMatches.total > 0 ? (
      <Link
        href={`/search?q=${encodeURIComponent(term)}`}
        className="text-primary text-sm font-semibold hover:underline"
      >
        {t('alsoInProducts', { count: formatNumber(productMatches.total, locale) })}
      </Link>
    ) : null;

  if (results.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          illustration={<SearchX className="h-7 w-7" />}
          title={t('noShopsTitle', { term })}
          description={t('noShopsBody')}
          action={{ label: t('allShops'), href: '/shops' }}
        />
        {crossTab && <p className="text-center">{crossTab}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-muted-foreground text-sm">
          {t('shopResultCount', {
            n: results.length,
            count: formatNumber(results.length, locale),
          })}
        </p>
        {crossTab}
      </div>
      <ShopGrid items={results} now={now} />
    </div>
  );
}

/**
 * The empty search page: the reader's own history, the mall's live trends, and
 * the popular grid underneath.
 *
 * The trend list is read HERE rather than in the browser — it is an aggregate
 * over everyone's searches, and a client that can ask for it is a client that
 * asks for it on every page load nobody wanted (see the same note on the header
 * field's dropdown).
 */
async function SearchStart({ locale }: { locale: string }) {
  const trends = await trendingSearches(locale, { limit: 10 });

  return (
    <div className="space-y-8">
      <SearchDiscovery trending={trends.map((row) => row.label)} />
      <PopularFallback layout="grid" />
    </div>
  );
}
