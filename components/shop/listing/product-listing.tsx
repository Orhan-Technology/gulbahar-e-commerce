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
import { isProductSort, productList, type ProductSort } from '@/lib/db/queries/products';
import { recordImpressions } from '@/lib/db/queries/promoted';
import type { PromotionSlotKey } from '@/lib/db/schema';

/** The query keys every listing surface reads. */
export type ListingSearchParams = {
  category?: string;
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
 *   1. toolbar — how many, sorted how, and (on a phone) the way to filter
 *   2. applied chips — WHY the count is what it is, in plain words
 *   3. paid strip, bounded and badged, above organic results it never reorders
 *   4. the grid
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
  emptyHref,
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
  /** Where "clear filters" goes from the empty state. */
  emptyHref: string;
}) {
  const t = await getTranslations('listing');

  const sort: ProductSort = isProductSort(query.sort) ? query.sort : 'popularity';
  const page = Math.max(1, Number(query.page ?? 1) || 1);

  const facetShopSlugs = Array.isArray(query.shop) ? query.shop : query.shop ? [query.shop] : [];
  const facetShopIds = scope.shopIds ? [] : await shopIdsBySlug(facetShopSlugs);

  const [result, promoted, user] = await Promise.all([
    productList({
      locale,
      categoryId: scope.categoryId,
      // A surface-level scope always wins over the facet: a shop page filtered
      // by "shop" could otherwise list another tenant's products.
      shopIds: scope.shopIds ?? (facetShopIds.length > 0 ? facetShopIds : undefined),
      search: scope.search ?? query.q,
      priceMin: query.priceMin ? Number(query.priceMin) : undefined,
      priceMax: query.priceMax ? Number(query.priceMax) : undefined,
      minRating: query.minRating ? Number(query.minRating) : undefined,
      inStockOnly: query.inStock === '1',
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
      ? promotedProductsForSlot(promotedSlot, { categoryId: scope.categoryId })
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
    return (
      <div className="space-y-4">
        <AppliedFilters labels={labels} />
        <EmptyState
          illustration={<PackageSearch className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          // One tap back to everything. An empty listing whose only exit is
          // undoing filters by hand is where a session ends.
          action={{ label: t('clearFilters'), href: emptyHref }}
        />
      </div>
    );
  }

  void recordImpressions(promoted.map((item) => item.campaignId));

  return (
    <div className="space-y-4">
      <ListingToolbar total={result.total} facets={facets} />

      <AppliedFilters labels={labels} />

      {promoted.length > 0 && (
        <section className="rounded-card border-border space-y-2 border bg-neutral-100/70 p-3">
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
      <ProductGridSkeleton count={12} />
    </div>
  );
}
