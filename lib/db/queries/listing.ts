import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn, searchKeyForInput } from '../localized';
import {
  campaigns,
  categories,
  products,
  promotionSlots,
  shops,
  type PromotionSlotKey,
} from '../schema';
import { firstProductImagePath, productRatingAvg, productReviewCount } from './fragments';
import { productSearchMatch } from './search';
import { MIN_RATING_REVIEWS } from '../../ratings';

/**
 * Facets and promoted slots for the listing pages (PRD §5.1).
 */

/** The URL state a listing reads, as it arrives from `searchParams`. */
export type FacetQuery = {
  category?: string;
  brand?: string | string[];
  shop?: string | string[];
  priceMin?: string;
  priceMax?: string;
  minRating?: string;
  inStock?: string;
  onOffer?: string;
  q?: string;
};

/** What the SURFACE is, as opposed to how the shopper has narrowed it. */
export type FacetScope = {
  categoryId?: string;
  shopIds?: string[];
  search?: string;
  onOfferOnly?: boolean;
  /**
   * A SURFACE rule, not a shopper's filter — the offers page never shows a
   * sold-out product, so its facet counts must not promise one either. Kept
   * apart from `query.inStock` so the availability checkbox stays unticked and
   * a chip for a filter nobody applied never appears above the grid.
   */
  inStockOnly?: boolean;
};

/** Per-option result counts, keyed the way the URL keys them. */
export type FacetCounts = {
  categories: Record<string, number>;
  shops: Record<string, number>;
  brands: Record<string, number>;
};

const asArray = (value: string | string[] | undefined): string[] =>
  Array.isArray(value) ? value : value ? [value] : [];

/**
 * Everything narrowing the listing EXCEPT one axis.
 *
 * Excluding the axis being counted is what makes the numbers useful rather than
 * tautological: with "Samsung" ticked, a Samsung count computed under the brand
 * filter would read "Samsung (12), Xiaomi (0), LG (0)" and the facet would look
 * broken. Counting each option as if it were the only choice on its own axis is
 * how every faceted catalogue does it, and it answers the question the shopper
 * is actually asking — "what happens if I tick this instead".
 */
function facetConditions(
  query: FacetQuery,
  scope: FacetScope,
  exclude: 'category' | 'shop' | 'brand' | null,
): SQL[] {
  const conditions: SQL[] = [eq(products.status, 'published'), eq(shops.status, 'approved')];

  if (scope.categoryId) {
    conditions.push(
      sql`(${products.categoryId} = ${scope.categoryId} or ${products.categoryId} in (
        select id from ${categories} where parent_id = ${scope.categoryId}
      ))`,
    );
  }
  if (scope.shopIds?.length) conditions.push(inArray(products.shopId, scope.shopIds));
  if (scope.search) conditions.push(productSearchMatch(searchKeyForInput(scope.search)));
  if (query.q && !scope.search) conditions.push(productSearchMatch(searchKeyForInput(query.q)));

  if (exclude !== 'category' && query.category) {
    conditions.push(
      sql`${products.categoryId} in (
        select id from categories where slug = ${query.category}
           or parent_id = (select id from categories where slug = ${query.category})
      )`,
    );
  }

  const shopSlugs = asArray(query.shop);
  if (exclude !== 'shop' && shopSlugs.length > 0 && !scope.shopIds?.length) {
    conditions.push(inArray(shops.slug, shopSlugs));
  }

  const brands = asArray(query.brand);
  if (exclude !== 'brand' && brands.length > 0) conditions.push(inArray(products.brand, brands));

  const effectivePrice = sql<number>`coalesce(${products.discountPrice}, ${products.price})`;
  if (query.priceMin) conditions.push(gte(effectivePrice, Number(query.priceMin)));
  if (query.priceMax) conditions.push(lte(effectivePrice, Number(query.priceMax)));
  /*
   * "FOUR STARS AND UP" MEANS FOUR STARS WORTH BELIEVING.
   *
   * A card hides its star row below MIN_RATING_REVIEWS (lib/ratings.ts) because
   * one review is not a rating — so a rating filter that ignores the evidence
   * threshold selects products the grid then renders with NO STARS ON THEM. The
   * reader asked for the best-reviewed things in the mall and got a wall of
   * cards saying nothing about reviews at all, which reads as a filter that did
   * not run.
   *
   * The constant is IMPORTED, never restated: the card and the filter have to
   * move together or the same contradiction comes straight back.
   */
  if (query.minRating) {
    conditions.push(gte(productRatingAvg, Number(query.minRating)));
    conditions.push(gte(productReviewCount, MIN_RATING_REVIEWS));
  }
  if (scope.inStockOnly || query.inStock === '1') conditions.push(sql`${products.stock} > 0`);
  if (scope.onOfferOnly || query.onOffer === '1') {
    conditions.push(
      sql`${products.discountPrice} is not null and ${products.discountPrice} < ${products.price}`,
    );
  }

  return conditions;
}

/**
 * Options the filter rail needs: shops, brands, real price bounds — and, when
 * the caller says what it is looking at, how many results each option would
 * return.
 *
 * `options` is what turns the counts on. A surface that cannot describe its own
 * scope gets the option lists and no numbers, which is the honest degradation:
 * a count computed against the whole catalogue on a page showing one shop is
 * worse than no count at all.
 *
 * The rating filter is applied through the correlated `productRatingAvg`
 * fragment rather than a GROUP BY … HAVING, so every count here is a plain
 * aggregate over the same predicate the grid uses.
 */
export async function filterFacets(
  locale: string,
  options?: { query?: FacetQuery; scope?: FacetScope },
) {
  const query = options?.query ?? {};
  const scope = options?.scope ?? {};
  const counted = options !== undefined;

  const brandBase = and(...facetConditions(query, scope, 'brand'));

  const [shopRows, boundsRows, brandRows] = await Promise.all([
    db
      .select({ id: shops.id, name: shops.name, slug: shops.slug })
      .from(shops)
      .where(eq(shops.status, 'approved'))
      .orderBy(asc(localizedColumn(shops.name, locale))),
    db
      .select({
        // Bounds come from the effective price, which is what the filter compares
        // against — otherwise the slider's floor could exclude a discounted item.
        min: sql<number>`coalesce(min(coalesce(${products.discountPrice}, ${products.price})), 0)::int`,
        max: sql<number>`coalesce(max(coalesce(${products.discountPrice}, ${products.price})), 0)::int`,
      })
      .from(products)
      .innerJoin(shops, eq(products.shopId, shops.id))
      .where(and(eq(products.status, 'published'), eq(shops.status, 'approved'))),
    db
      .select({ value: products.brand, total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(shops, eq(products.shopId, shops.id))
      .where(and(brandBase, isNotNull(products.brand)))
      .groupBy(products.brand)
      .orderBy(desc(sql`count(*)`), asc(products.brand)),
  ]);

  const brands = brandRows.map((row) => ({
    value: String(row.value),
    count: Number(row.total),
  }));

  const base = {
    shops: shopRows,
    brands,
    priceMin: Number(boundsRows[0]?.min ?? 0),
    priceMax: Number(boundsRows[0]?.max ?? 0),
  };

  /*
   * A caller that cannot describe its scope gets NO BRAND FACET, not an
   * uncounted one. Every other axis degrades harmlessly — a shop or a category
   * the surface does not hold is still a real place to go — but a brand list is
   * meaningless without a scope: on a shoe shop it offered all twenty-eight
   * brands in the mall, twenty-seven of which lead to an empty grid.
   */
  if (!counted) return { ...base, brands: [], counts: undefined, total: undefined };

  const [categoryRows, shopCountRows, totalRows] = await Promise.all([
    db
      .select({
        leaf: categories.slug,
        root: sql<string | null>`(select p.slug from categories p where p.id = ${categories.parentId})`,
        total: sql<number>`count(*)::int`,
      })
      .from(products)
      .innerJoin(shops, eq(products.shopId, shops.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...facetConditions(query, scope, 'category')))
      .groupBy(categories.slug, categories.parentId),
    db
      .select({ slug: shops.slug, total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(shops, eq(products.shopId, shops.id))
      .where(and(...facetConditions(query, scope, 'shop')))
      .groupBy(shops.slug),
    /*
     * The result count under EVERY narrowing, which the grid computes for
     * itself but the surrounding page cannot see — the listing resolves inside
     * its own Suspense boundary. A page needs it to decide whether to render a
     * filter rail at all: twenty facet groups beside a zero-result search is a
     * form asking someone to narrow nothing.
     */
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(shops, eq(products.shopId, shops.id))
      .where(and(...facetConditions(query, scope, null))),
  ]);

  const categoryCounts: Record<string, number> = {};
  for (const row of categoryRows) {
    const total = Number(row.total);
    categoryCounts[row.leaf] = (categoryCounts[row.leaf] ?? 0) + total;
    // A root's count is its own products plus every leaf beneath it — the same
    // self-or-child rule the listing itself filters by.
    if (row.root) categoryCounts[row.root] = (categoryCounts[row.root] ?? 0) + total;
  }

  const counts: FacetCounts = {
    categories: categoryCounts,
    shops: Object.fromEntries(shopCountRows.map((row) => [row.slug, Number(row.total)])),
    brands: Object.fromEntries(brands.map((row) => [row.value, row.count])),
  };

  return { ...base, counts, total: Number(totalRows[0]?.total ?? 0) };
}

export type PromotedProduct = {
  campaignId: string;
  id: string;
  slug: string;
  title: (typeof products.$inferSelect)['title'];
  price: number;
  discountPrice: number | null;
  stock: number;
  shopId: string;
  shopSlug: string;
  shopName: (typeof shops.$inferSelect)['name'];
  shopFloor: number | null;
  imagePath: string | null;
  rating: number;
  reviewCount: number;
};

/**
 * Promoted products for a listing slot (search_top, category_top,
 * product_related).
 *
 * Returned SEPARATELY from the organic list and capped by the slot's capacity, so
 * paid placement occupies a bounded strip above organic results and never
 * reorders them (PRD §8.4).
 *
 * `categoryId` narrows category_top to the category actually being viewed —
 * without it a campaign bought for one category would surface in all of them.
 */
export async function promotedProductsForSlot(
  slotKey: PromotionSlotKey,
  options: {
    categoryId?: string;
    excludeProductId?: string;
    /**
     * The search term the results answer, when there is one.
     *
     * A PAID SLOT BUYS POSITION AMONG MATCHING RESULTS — never an appearance on
     * unrelated searches. Without this a campaign on a phone case surfaced,
     * badged and boxed, above the results for "refrigerator", which reads as
     * spam and spends the credibility of the Sponsored badge everywhere else
     * (PRD §5.6, §8.4). Matched with the same predicate the organic search
     * uses, so a promoted product cannot appear on a query its own listing
     * would not.
     */
    search?: string;
    now?: Date;
  } = {},
): Promise<PromotedProduct[]> {
  const now = options.now ?? new Date();
  const term = options.search?.trim();
  const needle = term ? searchKeyForInput(term) : null;

  const rows = await db
    .select({
      campaignId: campaigns.id,
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
      capacity: promotionSlots.capacity,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .innerJoin(products, eq(campaigns.productId, products.id))
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(promotionSlots.key, slotKey),
        eq(campaigns.status, 'active'),
        sql`${campaigns.startsAt} <= ${now.toISOString()}`,
        sql`${campaigns.endsAt} >= ${now.toISOString()}`,
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        options.categoryId ? eq(products.categoryId, options.categoryId) : sql`true`,
        options.excludeProductId ? sql`${products.id} <> ${options.excludeProductId}` : sql`true`,
        // Literally the organic predicate, imported rather than restated. When
        // the two were separate copies this one still matched titles only, so
        // widening organic search to category and shop names would silently
        // have let a paid slot outlive the eligibility rule it is bound by.
        needle ? productSearchMatch(needle) : sql`true`,
      ),
    )
    .orderBy(asc(campaigns.startsAt));

  const capacity = rows[0]?.capacity ?? 0;
  // Built field by field so the slot's capacity does not leak into the result.
  return rows.slice(0, capacity).map((row) => ({
    campaignId: row.campaignId,
    id: row.id,
    slug: row.slug,
    title: row.title,
    price: row.price,
    discountPrice: row.discountPrice,
    stock: row.stock,
    shopId: row.shopId,
    shopSlug: row.shopSlug,
    shopFloor: row.shopFloor,
    shopName: row.shopName,
    imagePath: row.imagePath,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  }));
}

/** Promoted shops for the directory_top strip. */
export async function promotedShopsForDirectory(now: Date = new Date()) {
  const rows = await db
    .select({
      campaignId: campaigns.id,
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      categoryName: categories.name,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      capacity: promotionSlots.capacity,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .innerJoin(shops, eq(campaigns.shopId, shops.id))
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .where(
      and(
        eq(promotionSlots.key, 'directory_top'),
        eq(campaigns.status, 'active'),
        sql`${campaigns.startsAt} <= ${now.toISOString()}`,
        sql`${campaigns.endsAt} >= ${now.toISOString()}`,
        eq(shops.status, 'approved'),
      ),
    )
    .orderBy(asc(campaigns.startsAt));

  const capacity = rows[0]?.capacity ?? 0;
  return rows.slice(0, capacity);
}

/**
 * A shop's own published catalogue, with optional in-shop search and category
 * filter (PRD §5.1 shop page).
 *
 * Distinct from shopProductList, which is the shopkeeper's view and includes
 * drafts. This one is public and must never leak an unpublished product.
 */
export async function publicShopProducts(
  shopId: string,
  options: { search?: string; categoryId?: string } = {},
) {
  const term = options.search?.trim();

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      categoryId: products.categoryId,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.shopId, shopId),
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        options.categoryId ? eq(products.categoryId, options.categoryId) : sql`true`,
        // Same predicate as the mall-wide search, so «موبایل» typed into a
        // shop's own box finds that shop's phones instead of nothing — a
        // category word is no less likely here than on /search.
        term ? productSearchMatch(searchKeyForInput(term)) : sql`true`,
      ),
    )
    .orderBy(desc(products.viewCount), desc(products.createdAt));

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  }));
}

/**
 * Distinct categories a shop actually sells in, for its on-page filter chips.
 *
 * `sort` has to be selected, not just ordered by: with SELECT DISTINCT, Postgres
 * requires every ORDER BY expression to appear in the select list.
 */
export async function shopCategories(shopId: string) {
  return db
    .selectDistinct({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      sort: categories.sort,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.shopId, shopId), eq(products.status, 'published')))
    .orderBy(asc(categories.sort));
}

/** Resolves shop slugs from the filter rail into ids for productList. */
export async function shopIdsBySlug(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({ id: shops.id })
    .from(shops)
    .where(and(inArray(shops.slug, slugs), eq(shops.status, 'approved')));
  return rows.map((row) => row.id);
}
