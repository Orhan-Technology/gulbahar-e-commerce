import { getTranslations } from 'next-intl/server';
import { PackageSearch } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { AppliedFilters } from '@/components/shop/listing/applied-filters';
import type { FacetOptions } from '@/components/shop/listing/facet-controls';
import { LoadMore } from '@/components/shop/listing/load-more';
import { ListingToolbar } from '@/components/shop/listing/listing-toolbar';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { promotedProductsForSlot, shopIdsBySlug } from '@/lib/db/queries/listing';
import { categoryBySlug } from '@/lib/db/queries/shops';
import { isProductSort, productList, type ProductSort } from '@/lib/db/queries/products';
import { FILTER_KEYS } from '@/lib/listing';
import { recordImpressions } from '@/lib/db/queries/promoted';
import type { PromotionSlotKey } from '@/lib/db/schema';

/** The query keys every listing surface reads. */
export type ListingSearchParams = {
  category?: string;
  brand?: string | string[];
  shop?: string | string[];
  priceMin?: string;
  priceMax?: string;
  minRating?: string;
  inStock?: string;
  onOffer?: string;
  q?: string;
  sort?: string;
  page?: string;
};

const PAGE_SIZE = 24;

/**
 * THREE columns beside the filter rail, not four.
 *
 * Every listing surface is `max-w-6xl` with a 240px rail, so the grid always
 * has about 888px whatever the window does. Four columns cut each card to
 * ~204px — narrower than a phone card — and, because the counts these pages
 * return are small (nine on /offers, five or six on a shop page), a fourth
 * column is also what stranded a single card alone on a row of its own. Three
 * gives ~280px cards and packs the real result counts exactly.
 */
const LISTING_COLUMNS = 'lg:grid-cols-3';

/**
 * The listing (PRD §5.1).
 *
 * ONE component behind categories, search, offers and a shop's own catalogue.
 * They differ only in what they SCOPE to — a category id, a shop id, a search
 * term — and in what the toolbar sits under; everything from the result count
 * down is this, so a filter chip, a sort order and a load-more button behave
 * identically wherever a shopper meets them.
 *
 * Reading order inside it, which is Baymard's and not an accident:
 *
 *   1. toolbar — how many of how many, sorted how, and (on a phone) the way to
 *      filter
 *   2. applied chips — WHY the count is what it is, in plain words
 *   3. the note that says paid placement did not reorder anything
 *   4. the grid, with any promoted card first and badged
 *   5. load more, with the remainder stated
 *
 * The chips are second on purpose. On a phone the facets live behind a button,
 * so without them the entire filter state is invisible from the results screen —
 * which is how a shopper concludes the catalogue is empty rather than narrowed.
 */
export async function ProductListing({
  query,
  locale,
  facets,
  scope = {},
  promotedSlot,
  hideOutOfStock = false,
  defaultSort = 'popularity',
  emptyHref,
  emptyExtra,
}: {
  query: ListingSearchParams;
  locale: string;
  /** Omit to render the toolbar with no filter entry point. */
  facets?: FacetOptions;
  scope?: {
    categoryId?: string;
    /** Fixed shop, for a shop's own page — not the multi-select facet. */
    shopIds?: string[];
    search?: string;
  };
  promotedSlot?: PromotionSlotKey;
  /**
   * Drops sold-out products from the grid — a SURFACE rule, not a filter.
   *
   * The offers page is a promotional surface: every card on it carries a
   * discount ribbon, and a ribbon over «موجود نیست» is an advert for something
   * nobody can buy. Deliberately NOT expressed as `query.inStock`, which would
   * tick the availability checkbox and raise a chip for a filter the shopper
   * never applied — and which they could then remove, putting the sold-out
   * cards back on the one page that must not have them.
   */
  hideOutOfStock?: boolean;
  /**
   * The order used when the URL names none — the offers page opens on biggest
   * discount. The toolbar shows it as selected, so the control never claims an
   * order the grid is not in.
   */
  defaultSort?: ProductSort;
  /** Where "clear filters" goes from the empty state. */
  emptyHref: string;
  /**
   * Rendered UNDER the empty state, and only then.
   *
   * A dead end is the one place a listing owes the reader somewhere to go, and
   * what that is depends on the surface — on /search it is the categories and
   * shops that DO match the term. Passing the element rather than a flag keeps
   * the recovery queries out of the happy path entirely: React never renders
   * this node when there are results, so its awaits never run.
   */
  emptyExtra?: React.ReactNode;
}) {
  const t = await getTranslations('listing');

  const sort: ProductSort = isProductSort(query.sort) ? query.sort : defaultSort;
  const page = Math.max(1, Number(query.page ?? 1) || 1);

  const facetShopSlugs = Array.isArray(query.shop) ? query.shop : query.shop ? [query.shop] : [];
  const facetShopIds = scope.shopIds ? [] : await shopIdsBySlug(facetShopSlugs);
  const brands = Array.isArray(query.brand) ? query.brand : query.brand ? [query.brand] : [];

  /*
   * The category FACET, resolved to an id the grid actually uses.
   *
   * The facet writes `?category=<slug>` and the facet-count side
   * (facetConditions in queries/listing.ts) has always honoured it — but this
   * component only ever passed `scope.categoryId`, which exists solely on the
   * category ROUTE. So on /products, /search and /offers the chip lit up, the
   * counts changed, and the grid ignored the filter entirely: an active
   * «موبایل و تابلت» chip over a page of cricket bats. A surface scope still
   * wins when both exist, for the same reason the shop scope does.
   */
  const facetCategorySlug = Array.isArray(query.category) ? query.category[0] : query.category;
  const facetCategory =
    !scope.categoryId && facetCategorySlug ? await categoryBySlug(facetCategorySlug) : null;

  const [result, promoted, user] = await Promise.all([
    productList({
      locale,
      categoryId: scope.categoryId ?? facetCategory?.id,
      // A surface-level scope always wins over the facet: a shop page filtered
      // by "shop" could otherwise list another tenant's products.
      shopIds: scope.shopIds ?? (facetShopIds.length > 0 ? facetShopIds : undefined),
      brands: brands.length > 0 ? brands : undefined,
      search: scope.search ?? query.q,
      priceMin: query.priceMin ? Number(query.priceMin) : undefined,
      priceMax: query.priceMax ? Number(query.priceMax) : undefined,
      minRating: query.minRating ? Number(query.minRating) : undefined,
      inStockOnly: hideOutOfStock || query.inStock === '1',
      onOfferOnly: query.onOffer === '1',
      sort,
      page,
      pageSize: PAGE_SIZE,
      // Load more APPENDS: ?page=3 renders seventy-two products, not the third
      // twenty-four. See the flag's own note in the query.
      accumulate: true,
    }),
    // Paid strip only on page 1 — a shop bought placement above the results,
    // not above every page of them (PRD §8.4).
    promotedSlot && page === 1
      ? promotedProductsForSlot(promotedSlot, {
          categoryId: scope.categoryId,
          // On a search, a placement only shows if it ANSWERS the query.
          search: scope.search ?? query.q,
        })
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

  const labels = {
    categories: Object.fromEntries(
      (facets?.categories ?? []).flatMap((parent) => [
        [parent.slug, pickLocale(parent.name, locale)] as const,
        ...parent.children.map(
          (child) => [child.slug, pickLocale(child.name, locale)] as const,
        ),
      ]),
    ),
    shops: Object.fromEntries(
      (facets?.shops ?? []).map((shop) => [shop.slug, pickLocale(shop.name, locale)] as const),
    ),
  };

  if (result.total === 0) {
    /*
     * The copy has to match the REASON the list is empty, and there are three
     * different reasons — conflating any two of them puts advice on screen the
     * reader cannot act on.
     *
     *   narrowed  — filters are on: undo one. The only case "remove a filter"
     *               is honest advice.
     *   searched  — a term found nothing: try another spelling.
     *   neither   — the shopper opened a category that simply has no stock yet.
     *               This one used to borrow the filter copy and told them to
     *               "remove one of the filters" when the URL carried none: the
     *               page blaming them for something they did not do, with a
     *               button that clears nothing. It is not a failure at all, it
     *               is a shelf that has not been filled, and the honest move is
     *               to say so and put something worth looking at underneath.
     */
    const narrowed = FILTER_KEYS.some((key) => query[key] !== undefined);
    const searched = Boolean(scope.search ?? query.q);
    const unfiltered = !narrowed && !searched;

    return (
      <div className="space-y-4">
        <AppliedFilters labels={labels} />
        <EmptyState
          illustration={<PackageSearch className="h-7 w-7" />}
          title={
            unfiltered
              ? t('emptyUnfilteredTitle')
              : searched && !narrowed
                ? t('emptySearchTitle', { term: scope.search ?? query.q ?? '' })
                : t('emptyTitle')
          }
          description={
            unfiltered
              ? t('emptyUnfilteredBody')
              : searched && !narrowed
                ? t('emptySearchBody')
                : t('emptyBody')
          }
          // One tap back to everything. An empty listing whose only exit is
          // undoing filters by hand is where a session ends.
          action={{
            label: narrowed ? t('clearFilters') : t('browseAll'),
            href: narrowed ? emptyHref : '/products',
          }}
        />
        {emptyExtra}
      </div>
    );
  }

  void recordImpressions(promoted.map((item) => item.campaignId));

  return (
    <div className="space-y-4">
      <ListingToolbar
        total={result.total}
        // Clamped: a promoted product that the current page's organic slice
        // does not contain would otherwise make "showing 25 of 24".
        shown={Math.min(promoted.length + organic.length, result.total)}
        facets={facets}
        defaultSort={defaultSort}
      />

      <AppliedFilters labels={labels} />

      {/*
        THE PAID PLACEMENT IS A CARD IN THE GRID, not a panel above it.
        Boxed in its own bordered strip, a single promoted product occupied a
        full-width band roughly five hundred pixels tall before the first
        organic result — one product given more space than the six under it,
        which is not the position that was sold and reads as an interstitial ad.
        First position in the same grid, at the same size, with the Sponsored
        badge the card already draws, is the whole of what §8.4 promises: a
        bought place among matching results that never reorders them.

        The note stays, above the grid, because the badge alone does not explain
        that the ordering underneath is untouched.
      */}
      {promoted.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
          <SponsoredBadge />
          {t('promotedNote')}
        </p>
      )}

      <ProductGrid
        items={[...promoted.map((item) => ({ ...item, sponsored: true as const })), ...organic]}
        savedIds={saved}
        className={LISTING_COLUMNS}
        priority
      />

      <LoadMore
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}

export function ProductListingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-40" />
      </div>
      <ProductGridSkeleton count={12} className={LISTING_COLUMNS} />
    </div>
  );
}
