import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '..';
import { orderItems, orders, products, reviewResponses, reviews, shops, users } from '../schema';

/**
 * Review reads (PRD §5.5).
 *
 * Verified-purchase-only is enforced in two places: the schema's unique index on
 * reviews.order_item_id, and `reviewableOrderItem` below, which is what the UI
 * uses to decide whether to offer a review form at all.
 */

const PAGE_SIZE = 5;

/**
 * Visible reviews for a product, newest first, with any shopkeeper reply nested.
 *
 * Removed and reported reviews are excluded from the public list; a reported one
 * stays visible to admin in the moderation queue but must not shape what a
 * customer reads (PRD §7.2).
 */
export async function productReviews(productId: string, page = 1) {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      createdAt: reviews.createdAt,
      customerName: users.name,
      customerId: users.id,
      responseBody: reviewResponses.body,
      responseCreatedAt: reviewResponses.createdAt,
      responseShopName: shops.name,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
    .leftJoin(shops, eq(reviewResponses.shopId, shops.id))
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'visible')))
    .orderBy(desc(reviews.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'visible')));

  return {
    items: rows,
    total: Number(total),
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)),
  };
}

/**
 * The order item that entitles this user to review this product, or null.
 *
 * Conditions, all of which the PRD requires (§5.5):
 *   - the order reached `fulfilled` — reviewable only after delivery
 *   - the line has no review yet (the schema's unique key would reject a second)
 *   - the customer has no existing review for this product, because the rule is
 *     one review per customer per product, not per purchase. Someone who bought
 *     the same item twice gets one voice, not two.
 */
export async function reviewableOrderItem(
  userId: string | null | undefined,
  productId: string,
): Promise<{ orderItemId: string } | null> {
  if (!userId) return null;

  const existing = await userReviewForProduct(userId, productId);
  if (existing) return null;

  const [row] = await db
    .select({ orderItemId: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(reviews, eq(reviews.orderItemId, orderItems.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, 'fulfilled'),
        eq(orderItems.productId, productId),
        isNull(reviews.id),
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(1);

  return row ?? null;
}

/** The user's own review for a product, so the form can offer an edit. */
export async function userReviewForProduct(userId: string, productId: string) {
  const [row] = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
    .limit(1);

  return row ?? null;
}

/**
 * Related products: this shop first, then the same category (PRD §5.2).
 *
 * One query with a rank column rather than two round trips, so ordering across
 * the two groups is decided in the database.
 */
export async function relatedProductsFor(
  productId: string,
  shopId: string,
  categoryId: string | null,
  limit = 8,
) {
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
      imagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = products.id
        order by pi.sort asc limit 1
      )`,
      rating: sql<number>`coalesce((
        select avg(r.rating)::float8 from reviews r
        where r.product_id = products.id and r.status = 'visible'
      ), 0)`,
      reviewCount: sql<number>`(
        select count(*)::int from reviews r
        where r.product_id = products.id and r.status = 'visible'
      )`,
      // Same shop ranks above same category.
      rank: sql<number>`case when ${products.shopId} = ${shopId} then 0 else 1 end`,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        sql`${products.id} <> ${productId}`,
        categoryId
          ? sql`(${products.shopId} = ${shopId} or ${products.categoryId} = ${categoryId})`
          : eq(products.shopId, shopId),
      ),
    )
    .orderBy(
      asc(sql`case when ${products.shopId} = ${shopId} then 0 else 1 end`),
      desc(products.viewCount),
    )
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  }));
}

/**
 * Bumps the seeded view counter. Fire-and-forget: an analytics increment must
 * never be the reason a product page fails to render (PRD §12.4 — no analytics
 * SDK, this counter is all there is).
 */
export async function recordProductView(productId: string): Promise<void> {
  try {
    await db
      .update(products)
      .set({ viewCount: sql`${products.viewCount} + 1` })
      .where(eq(products.id, productId));
  } catch {
    // Intentionally swallowed.
  }
}
