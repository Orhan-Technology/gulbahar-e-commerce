import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '..';
import {
  campaigns,
  categories,
  offers,
  products,
  promotionSlots,
  shops,
  wishlistItems,
} from '../schema';
import {
  firstProductImagePath,
  productRatingAvg,
  productReviewCount,
  shopPublishedProductCount,
  shopRatingAvg,
  shopReviewCount,
} from './fragments';

/**
 * Queries specific to the storefront home page (PRD §5.1).
 *
 * Every promoted section returns its campaign id alongside the content so the
 * page can record an impression and render the Sponsored badge (PRD §8.4).
 */

/**
 * The single home_hero placement. Returns whichever of product or shop the
 * campaign points at, so the page can render either without a second query.
 *
 * Null when the slot is unsold — the page then falls back to a default banner
 * rather than collapsing, because an empty hero is the worst thing the client
 * could see on the first screen (PRD §5.1).
 */
export async function homeHeroCampaign(now: Date = new Date()) {
  const [row] = await db
    .select({
      campaignId: campaigns.id,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopDescription: shops.description,
      shopBannerPath: shops.bannerPath,
      shopLogoPath: shops.logoPath,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      productPrice: products.price,
      productDiscountPrice: products.discountPrice,
      productImagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = campaigns.product_id
        order by pi.sort asc limit 1
      )`,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .innerJoin(shops, eq(campaigns.shopId, shops.id))
    .leftJoin(products, eq(campaigns.productId, products.id))
    .where(
      and(
        eq(promotionSlots.key, 'home_hero'),
        eq(campaigns.status, 'active'),
        lte(campaigns.startsAt, now),
        gte(campaigns.endsAt, now),
        eq(shops.status, 'approved'),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Featured shops carousel: promoted first, then organic top-rated to fill. */
export async function featuredShops(limit = 8, now: Date = new Date()) {
  const promoted = await db
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
      rating: shopRatingAvg,
      reviewCount: shopReviewCount,
      productCount: shopPublishedProductCount,
      capacity: promotionSlots.capacity,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .innerJoin(shops, eq(campaigns.shopId, shops.id))
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .where(
      and(
        eq(promotionSlots.key, 'featured_shops'),
        eq(campaigns.status, 'active'),
        lte(campaigns.startsAt, now),
        gte(campaigns.endsAt, now),
        eq(shops.status, 'approved'),
      ),
    )
    .orderBy(campaigns.startsAt);

  // Capacity caps paid placement so organic results stay dominant (PRD §8.4).
  const capacity = promoted[0]?.capacity ?? 0;
  const sponsored = promoted
    .slice(0, capacity)
    .map((row) => ({ ...row, sponsored: true as const }));
  const sponsoredIds = sponsored.map((row) => row.id);

  const remaining = Math.max(0, limit - sponsored.length);
  const organic =
    remaining === 0
      ? []
      : await db
          .select({
            campaignId: sql<string | null>`null`,
            id: shops.id,
            slug: shops.slug,
            name: shops.name,
            categoryName: categories.name,
            floor: shops.floor,
            unitNumber: shops.unitNumber,
            logoPath: shops.logoPath,
            bannerPath: shops.bannerPath,
            rating: shopRatingAvg,
            reviewCount: shopReviewCount,
            productCount: shopPublishedProductCount,
          })
          .from(shops)
          .leftJoin(categories, eq(shops.categoryId, categories.id))
          .where(
            and(
              eq(shops.status, 'approved'),
              sponsoredIds.length > 0 ? sql`${shops.id} not in ${sponsoredIds}` : sql`true`,
            ),
          )
          .orderBy(desc(shopRatingAvg))
          .limit(remaining);

  return [...sponsored, ...organic.map((row) => ({ ...row, capacity, sponsored: false as const }))];
}

/**
 * Active offers for the home strip (PRD §5.1), with the shop they belong to and
 * a representative product image so each chip has something to show.
 */
export async function activeOffers(limit = 8, now: Date = new Date()) {
  const rows = await db
    .select({
      id: offers.id,
      name: offers.name,
      type: offers.type,
      value: offers.value,
      scope: offers.scope,
      productIds: offers.productIds,
      startsAt: offers.startsAt,
      endsAt: offers.endsAt,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopLogoPath: shops.logoPath,
    })
    .from(offers)
    .innerJoin(shops, eq(offers.shopId, shops.id))
    .where(
      and(
        eq(offers.active, true),
        lte(offers.startsAt, now),
        gte(offers.endsAt, now),
        eq(shops.status, 'approved'),
      ),
    )
    .orderBy(offers.endsAt)
    .limit(limit);

  return rows;
}

/**
 * Products carrying an active discount — what the offers section actually links
 * to, so "Offers" is never a page of chips with nothing behind them.
 */
export async function discountedProducts(limit = 12) {
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
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        sql`${products.discountPrice} is not null and ${products.discountPrice} < ${products.price}`,
      ),
    )
    .orderBy(desc(sql`(${products.price} - ${products.discountPrice})::float8 / ${products.price}`))
    .limit(limit);

  return rows;
}

/**
 * Which of the given products the viewer has wishlisted, so hearts render in the
 * correct state on first paint instead of popping after hydration.
 *
 * Uses inArray rather than interpolating ids into raw SQL: these are internal
 * uuids today, but a parameterised query is the only version that stays safe if
 * a caller ever passes something user-supplied.
 */
export async function wishlistedProductIds(
  userId: string | null | undefined,
  productIds: string[],
): Promise<Set<string>> {
  if (!userId || productIds.length === 0) return new Set();

  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), inArray(wishlistItems.productId, productIds)));

  return new Set(rows.map((row) => row.productId));
}

/**
 * The viewer's wishlist with live price and stock (PRD §5.6).
 *
 * Price and stock are read fresh rather than snapshotted at save time — the point
 * of a wishlist is to watch for a change, so a stale price would defeat it.
 */
export async function wishlistForUser(userId: string) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      status: products.status,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
      savedAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  }));
}
