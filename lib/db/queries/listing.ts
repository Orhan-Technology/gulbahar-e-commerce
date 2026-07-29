import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn, searchKey, searchKeyForInput } from '../localized';
import {
  campaigns,
  categories,
  products,
  promotionSlots,
  shops,
  type PromotionSlotKey,
} from '../schema';
import { firstProductImagePath, productRatingAvg, productReviewCount } from './fragments';

/**
 * Facets and promoted slots for the listing pages (PRD §5.1).
 */

/** Options the filter rail needs: every approved shop plus real price bounds. */
export async function filterFacets(locale: string) {
  const [shopRows, boundsRows] = await Promise.all([
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
  ]);

  return {
    shops: shopRows,
    priceMin: Number(boundsRows[0]?.min ?? 0),
    priceMax: Number(boundsRows[0]?.max ?? 0),
  };
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
        needle
          ? sql`(${searchKey(products.title)} like '%' || ${needle} || '%'
                 or similarity(${searchKey(products.title)}, ${needle}) > 0.12)`
          : sql`true`,
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
        term
          ? sql`${searchKey(products.title)} like '%' || ${searchKeyForInput(term)} || '%'`
          : sql`true`,
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
