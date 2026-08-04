import { and, asc, avg, count, desc, eq, gte, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { MIN_RATING_REVIEWS } from '../../ratings';
import { localizedColumn, searchKeyForInput } from '../localized';
import { productSearchMatch, productSearchRelevance } from './search';
import {
  firstProductImagePath,
  productRatingAvg,
  productReviewCount,
  productWishlistCount,
  shopRatingAvg,
  shopReviewCount,
} from './fragments';
import {
  categories,
  productImages,
  products,
  productVariants,
  reviews,
  shops,
  wishlistItems,
  type LocalizedText,
} from '../schema';

/*
 * Sort names live in lib/listing.ts, which has no database imports — the client
 * toolbar needs them too, and reading them from here pulled `postgres` into the
 * browser bundle. Re-exported so query call sites need only one import.
 */
import { type ProductSort } from '../../listing';

export { PRODUCT_SORTS, isProductSort, type ProductSort } from '../../listing';

export type ProductListFilters = {
  categoryId?: string;
  /** Includes descendants when the category is a parent. */
  includeChildCategories?: boolean;
  shopIds?: string[];
  /**
   * Brand names, matched exactly (PRD §5.1).
   *
   * `products.brand` is a plain text column, not localized: a brand is a proper
   * noun and «سامسونگ» and "Samsung" are the same manufacturer, so the seed
   * stores one spelling and the facet lists what the catalogue actually holds.
   */
  brands?: string[];
  priceMin?: number;
  priceMax?: number;
  minRating?: number;
  inStockOnly?: boolean;
  /**
   * Only products carrying a live discount.
   *
   * Defined as `discount_price < price`, which is exactly what puts the red
   * percentage ribbon on the card — so the facet and the badge can never
   * disagree about which products are "on offer".
   */
  onOfferOnly?: boolean;
  /**
   * Free-text term, matched the same way /search matches it.
   *
   * Present so search results are a LISTING like any other: the same facets,
   * the same chips, the same toolbar, the same pagination. Keeping search on a
   * separate query is how a product ends up with filters that work everywhere
   * except the screen people reach for first.
   */
  search?: string;
  sort?: ProductSort;
  locale: string;
  page?: number;
  pageSize?: number;
  /**
   * Return pages 1..page as one list instead of page `page` alone.
   *
   * This is what makes "load more" a real append while leaving the URL
   * pageable: `?page=3` renders seventy-two products, not the third
   * twenty-four. Without it the button would replace the grid — which is
   * numbered pagination wearing a different label, and the one thing the load
   * more pattern exists to avoid.
   */
  accumulate?: boolean;
};

export type ProductListItem = {
  id: string;
  slug: string;
  title: LocalizedText;
  price: number;
  discountPrice: number | null;
  stock: number;
  shopId: string;
  shopName: LocalizedText;
  shopSlug: string;
  shopFloor: number | null;
  imagePath: string | null;
  rating: number;
  reviewCount: number;
};

const DEFAULT_PAGE_SIZE = 24;

/**
 * Discount as a fraction of the original price, 0 when there is none.
 *
 * Exactly the number the red ribbon on a card shows, so the "biggest discount"
 * sort and the badge can never disagree about which product is the better deal.
 */
export const discountFraction = sql<number>`case
  when ${products.discountPrice} is not null and ${products.discountPrice} < ${products.price}
  then (${products.price} - ${products.discountPrice})::float8 / ${products.price}
  else 0
end`;

/**
 * Public product listing (PRD §5.1).
 *
 * Only published products from approved shops are ever visible — a pending shop
 * can build its whole catalogue but stays invisible until approval flips one
 * switch (PRD §7.1).
 *
 * Promoted results are NOT handled here. They are fetched separately via
 * lib/db/queries/promoted and rendered above the organic list, so paid placement
 * can never reorder organic ranking (PRD §8.4).
 */
export async function productList(filters: ProductListFilters) {
  const {
    categoryId,
    includeChildCategories = true,
    shopIds,
    brands,
    priceMin,
    priceMax,
    minRating,
    inStockOnly,
    onOfferOnly,
    search,
    sort = 'popularity',
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    accumulate = false,
  } = filters;

  const conditions: SQL[] = [eq(products.status, 'published'), eq(shops.status, 'approved')];

  if (categoryId) {
    if (includeChildCategories) {
      conditions.push(
        sql`(${products.categoryId} = ${categoryId} or ${products.categoryId} in (
          select id from ${categories} where parent_id = ${categoryId}
        ))`,
      );
    } else {
      conditions.push(eq(products.categoryId, categoryId));
    }
  }
  if (shopIds?.length) conditions.push(inArray(products.shopId, shopIds));
  if (brands?.length) conditions.push(inArray(products.brand, brands));
  // Filter on the effective (post-discount) price, which is what the customer
  // sees on the card — filtering on `price` would hide discounted items.
  const effectivePrice = sql<number>`coalesce(${products.discountPrice}, ${products.price})`;
  if (priceMin !== undefined) conditions.push(gte(effectivePrice, priceMin));
  if (priceMax !== undefined) conditions.push(lte(effectivePrice, priceMax));
  if (inStockOnly) conditions.push(sql`${products.stock} > 0`);
  if (onOfferOnly) {
    conditions.push(
      sql`${products.discountPrice} is not null and ${products.discountPrice} < ${products.price}`,
    );
  }

  /*
   * Term matching is SHARED with lib/db/queries/search.ts, not reimplemented:
   * the header suggestions, the results grid and the paid-slot eligibility test
   * all have to agree about what a term matches, and three copies of a
   * predicate is how they stop agreeing. It spans title, category, shop name
   * and brand — see productSearchMatch for why title alone was not enough.
   */
  const term = search?.trim();
  const needle = term ? searchKeyForInput(term) : null;
  const similarity = needle ? productSearchRelevance(needle) : null;

  if (needle) conditions.push(productSearchMatch(needle));

  const where = and(...conditions);

  const ratingExpr = sql<number>`coalesce(avg(${reviews.rating}) filter (where ${reviews.status} = 'visible'), 0)`;
  const reviewCountExpr = sql<number>`count(${reviews.id}) filter (where ${reviews.status} = 'visible')`;

  /*
   * A minimum-rating filter has to agree with what the CARD is willing to show.
   * Cards hide the star row below MIN_RATING_REVIEWS, so filtering on the
   * average alone returned products displaying no stars at all under a heading
   * that said "4 and above" — and the facet counts beside the grid, which apply
   * the same threshold, disagreed with the grid itself.
   */
  const ratedAtLeast = (minimum: number) =>
    and(gte(ratingExpr, minimum), gte(reviewCountExpr, MIN_RATING_REVIEWS));

  /*
   * AVAILABILITY IS THE OUTERMOST SORT KEY, under every user-chosen sort.
   *
   * "Most popular" ranked a sold-out phone first in electronics, in
   * mobiles-tablets and in the search popular block, because view count is a
   * record of past demand and stock is not part of it — so the first card a
   * customer tapped said «موجود نیست». No sort a shopper picks means "show me
   * things I cannot buy first"; availability is a precondition of the ranking,
   * not a competitor to it. Out-of-stock products keep their place in the
   * results and their relative order WITHIN the chosen sort, they simply stop
   * leading. Placed here rather than in each listing page so /products,
   * /categories/[slug], /search, the shop page and the rails cannot disagree.
   */
  const inStockFirst = sql`(${products.stock} > 0) desc`;

  const orderBy = {
    /*
     * POPULARITY is the default, not newest.
     *
     * A marketplace whose default order is "most recently added" shows the
     * customer whatever a shopkeeper last uploaded, which is a ranking that
     * serves the shop and not the shopper. View count is the closest honest
     * proxy for demand we have, with rating breaking its ties.
     */
    /*
     * With a search term, "popularity" means RELEVANCE — a term search ordered
     * by view count would put the most-viewed near-miss above the exact match.
     * The control still reads "popularity" because that is what the shopper
     * asked for; relevance is what popularity means once a query narrows it.
     */
    popularity: similarity
      ? [desc(similarity), desc(ratingExpr)]
      : [desc(products.viewCount), desc(ratingExpr)],
    newest: [desc(products.createdAt)],
    price_asc: [asc(effectivePrice)],
    price_desc: [desc(effectivePrice)],
    // Paid placement never buys a better score, so rating sort is purely organic.
    rating: [desc(ratingExpr), desc(reviewCountExpr)],
    /*
     * PERCENTAGE off, not afghanis off. A 5,000 afghani saving on a 58,000
     * afghani phone is a worse deal than 300 off a 990 afghani pencil case, and
     * sorting by the absolute amount would put every expensive product on top
     * of the offers page whatever its discount actually was.
     */
    discount: [desc(discountFraction), desc(ratingExpr)],
  }[sort];

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopName: shops.name,
      shopSlug: shops.slug,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: ratingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .leftJoin(reviews, eq(reviews.productId, products.id))
    .where(where)
    .groupBy(products.id, shops.id)
    .having(minRating !== undefined ? ratedAtLeast(minRating) : undefined)
    .orderBy(inStockFirst, ...orderBy, desc(products.id))
    .limit(accumulate ? pageSize * page : pageSize)
    .offset(accumulate ? 0 : (page - 1) * pageSize);

  /*
   * The count must go through the SAME grouped-and-having query as the rows.
   *
   * A plain count over the where clause ignores the rating HAVING, so with
   * minRating set the header claimed 69 results while the grid showed far fewer,
   * and pagination offered pages that render empty. Counting rows of the grouped
   * subquery keeps the two in agreement by construction.
   */
  const grouped = db
    .select({ id: products.id })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .leftJoin(reviews, eq(reviews.productId, products.id))
    .where(where)
    .groupBy(products.id)
    .having(minRating !== undefined ? ratedAtLeast(minRating) : undefined)
    .as('matching_products');

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(grouped);

  return {
    items: rows.map((row) => ({
      ...row,
      rating: Number(row.rating),
      reviewCount: Number(row.reviewCount),
    })),
    total: Number(total),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(Number(total) / pageSize)),
  };
}

/**
 * Product page payload (PRD §5.2), including images, variants, shop attribution
 * and the rating distribution the summary bars need.
 */
export async function productDetail(slug: string, locale: string) {
  const [row] = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      description: products.description,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      status: products.status,
      viewCount: products.viewCount,
      createdAt: products.createdAt,
      categoryId: products.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopLogoPath: shops.logoPath,
      shopVerifiedAt: shops.verifiedAt,
      attributes: products.attributes,
      features: products.features,
      brand: products.brand,
      model: products.model,
      shopFloor: shops.floor,
      shopUnitNumber: shops.unitNumber,
      shopStatus: shops.status,
      /*
       * The SHOP's reputation, for a product that has none of its own.
       *
       * A new listing under a shop with forty reviews is not an unknown
       * quantity, but the page presented it as one: no stars, no count, no
       * signal of any kind next to the price. Borrowing the seller's record —
       * clearly labelled as the SHOP's, never the product's — is the honest
       * version of the trust the reader is trying to establish, and it is what
       * a market stall does by simply being the stall it has always been.
       *
       * Selected here rather than fetched separately: it is two aggregates on
       * a row already joined, and the product page has no need of a fourth
       * round trip to say one sentence.
       */
      shopRating: shopRatingAvg,
      shopReviewCount,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.slug, slug))
    .limit(1);

  if (!row) return null;

  const [images, variants, ratingSummary, saveCount] = await Promise.all([
    db
      .select({
        id: productImages.id,
        path: productImages.path,
        alt: productImages.alt,
        blurDataUrl: productImages.blurDataUrl,
      })
      .from(productImages)
      .where(eq(productImages.productId, row.id))
      .orderBy(asc(productImages.sort)),
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        options: productVariants.options,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, row.id))
      .orderBy(asc(productVariants.sort)),
    productRatingSummary(row.id),
    db.select({ total: count() }).from(wishlistItems).where(eq(wishlistItems.productId, row.id)),
  ]);

  return {
    ...row,
    locale,
    images,
    variants,
    rating: ratingSummary,
    shopRating: Number(row.shopRating),
    shopReviewCount: Number(row.shopReviewCount),
    wishlistCount: Number(saveCount[0]?.total ?? 0),
  };
}

/**
 * Average, count, and 1–5 distribution for the product page summary bars
 * (PRD §5.2). Only visible reviews count — removed ones must not affect the
 * average a customer sees.
 */
export async function productRatingSummary(productId: string) {
  const [row] = await db
    .select({
      average: avg(reviews.rating),
      total: count(reviews.id),
      star1: sql<number>`count(*) filter (where ${reviews.rating} = 1)`,
      star2: sql<number>`count(*) filter (where ${reviews.rating} = 2)`,
      star3: sql<number>`count(*) filter (where ${reviews.rating} = 3)`,
      star4: sql<number>`count(*) filter (where ${reviews.rating} = 4)`,
      star5: sql<number>`count(*) filter (where ${reviews.rating} = 5)`,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'visible')));

  return {
    average: Number(row?.average ?? 0),
    total: Number(row?.total ?? 0),
    distribution: {
      1: Number(row?.star1 ?? 0),
      2: Number(row?.star2 ?? 0),
      3: Number(row?.star3 ?? 0),
      4: Number(row?.star4 ?? 0),
      5: Number(row?.star5 ?? 0),
    },
  };
}

/** Related products: same shop first, then same category (PRD §5.2). */
export async function relatedProducts(
  productId: string,
  shopId: string,
  categoryId: string | null,
  locale: string,
  limit = 8,
) {
  const sameShop = await productList({
    shopIds: [shopId],
    locale,
    pageSize: limit,
    sort: 'rating',
  });
  const filtered = sameShop.items.filter((item) => item.id !== productId);

  if (filtered.length >= limit || !categoryId) return filtered.slice(0, limit);

  const sameCategory = await productList({
    categoryId,
    locale,
    pageSize: limit * 2,
    sort: 'rating',
  });
  const seen = new Set([productId, ...filtered.map((item) => item.id)]);

  return [...filtered, ...sameCategory.items.filter((item) => !seen.has(item.id))].slice(0, limit);
}

/**
 * Trending — ordered by the seeded view counter, which is what gives the home
 * page genuine shape before real analytics exist (PRD §9.1).
 */
export async function trendingProducts(locale: string, limit = 12) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopName: shops.name,
      shopSlug: shops.slug,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.status, 'published'), eq(shops.status, 'approved')))
    // Same availability-first rule as productList: this feeds the search page's
    // popular block and every empty-state fallback, which are the screens a
    // shopper reaches with no other idea of what to look at. Leading one of
    // those with «موجود نیست» is the worst place to spend the only card they
    // are certain to see.
    .orderBy(sql`(${products.stock} > 0) desc`, desc(products.viewCount), desc(products.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  }));
}

/** Latest published products (PRD §5.1 "new arrivals"). */
export async function newArrivals(locale: string, limit = 12) {
  const result = await productList({ locale, sort: 'newest', pageSize: limit });
  return result.items;
}

/** Ordered by translated title — used by the shopkeeper's own product list. */
export function titleOrder(locale: string) {
  return asc(localizedColumn(products.title, locale));
}

/** Products the shopkeeper owns, including drafts (PRD §6.2). */
export async function shopProductList(
  shopId: string,
  options: { status?: 'draft' | 'published' | 'unpublished'; locale: string; search?: string } = {
    locale: 'fa',
  },
) {
  const conditions: SQL[] = [eq(products.shopId, shopId)];
  if (options.status) conditions.push(eq(products.status, options.status));

  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      status: products.status,
      imagePath: firstProductImagePath,
      wishlistCount: productWishlistCount,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(titleOrder(options.locale));
}

/** Excludes a product id — small helper used by related-product composition. */
export function notProduct(productId: string) {
  return ne(products.id, productId);
}
