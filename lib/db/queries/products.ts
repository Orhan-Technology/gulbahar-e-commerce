import { and, asc, avg, count, desc, eq, gte, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn, searchKey, searchKeyForInput } from '../localized';
import {
  firstProductImagePath,
  productRatingAvg,
  productReviewCount,
  productWishlistCount,
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

/** Shared with lib/db/queries/search.ts — the same term must match the same rows. */
const SIMILARITY_THRESHOLD = 0.12;

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
   * Term matching, identical to lib/db/queries/search.ts: a substring match OR
   * a fuzzy one. The ILIKE arm matters because trigram similarity is
   * length-sensitive — "a54" against a long title scores low even though it is
   * an exact substring.
   */
  const term = search?.trim();
  const needle = term ? searchKeyForInput(term) : null;
  const similarity = needle
    ? sql<number>`similarity(${searchKey(products.title)}, ${needle})`
    : null;

  if (needle && similarity) {
    conditions.push(
      sql`(${searchKey(products.title)} like '%' || ${needle} || '%' or ${similarity} > ${SIMILARITY_THRESHOLD})`,
    );
  }

  const where = and(...conditions);

  const ratingExpr = sql<number>`coalesce(avg(${reviews.rating}) filter (where ${reviews.status} = 'visible'), 0)`;
  const reviewCountExpr = sql<number>`count(${reviews.id}) filter (where ${reviews.status} = 'visible')`;

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
    .having(minRating !== undefined ? gte(ratingExpr, minRating) : undefined)
    .orderBy(...orderBy, desc(products.id))
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
    .having(minRating !== undefined ? gte(ratingExpr, minRating) : undefined)
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
      specs: products.specs,
      shopFloor: shops.floor,
      shopUnitNumber: shops.unitNumber,
      shopStatus: shops.status,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.slug, slug))
    .limit(1);

  if (!row) return null;

  const [images, variants, ratingSummary, saveCount] = await Promise.all([
    db
      .select({ id: productImages.id, path: productImages.path, alt: productImages.alt })
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
    .orderBy(desc(products.viewCount), desc(products.createdAt))
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
