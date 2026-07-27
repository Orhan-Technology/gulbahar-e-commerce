import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { products, reviewResponses, reviews, users } from '../schema';

/**
 * Reviews across a shop's whole catalogue (PRD §6.5).
 *
 * Scoped by joining products, since reviews belong to a product and products
 * belong to a shop — there is no shop_id on reviews to forget to filter.
 *
 * Removed reviews are excluded: admin took them down, and showing a shopkeeper
 * something the public cannot see would invite them to respond to it.
 */

export type ShopReviewFilters = {
  shopId: string;
  /** Exact star rating, 1–5. */
  rating?: number;
  /** Only those the shop has not answered yet — the actionable set. */
  unanswered?: boolean;
};

export async function shopReviews(filters: ShopReviewFilters) {
  const conditions: SQL[] = [
    eq(products.shopId, filters.shopId),
    sql`${reviews.status} <> 'removed'`,
  ];
  if (filters.rating) conditions.push(eq(reviews.rating, filters.rating));
  if (filters.unanswered) conditions.push(sql`${reviewResponses.id} is null`);

  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      authorName: users.name,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      responseId: reviewResponses.id,
      responseBody: reviewResponses.body,
      responseAt: reviewResponses.createdAt,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt));
}

/** Counts per rating plus the unanswered total, for the filter chips. */
export async function shopReviewCounts(shopId: string) {
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      unanswered: sql<number>`count(*) filter (where ${reviewResponses.id} is null)::int`,
      r5: sql<number>`count(*) filter (where ${reviews.rating} = 5)::int`,
      r4: sql<number>`count(*) filter (where ${reviews.rating} = 4)::int`,
      r3: sql<number>`count(*) filter (where ${reviews.rating} = 3)::int`,
      r2: sql<number>`count(*) filter (where ${reviews.rating} = 2)::int`,
      r1: sql<number>`count(*) filter (where ${reviews.rating} = 1)::int`,
      average: sql<number>`coalesce(avg(${reviews.rating})::float8, 0)`,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
    .where(and(eq(products.shopId, shopId), sql`${reviews.status} <> 'removed'`));

  return row ?? { all: 0, unanswered: 0, r5: 0, r4: 0, r3: 0, r2: 0, r1: 0, average: 0 };
}

/**
 * One review, confirmed to belong to this shop. Returned by the actions before
 * they write, so the ownership check is not duplicated in each of them.
 */
export async function shopReviewById(shopId: string, reviewId: string) {
  const [row] = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      status: reviews.status,
      userId: reviews.userId,
      userLocale: users.locale,
      productTitle: products.title,
      responseId: reviewResponses.id,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
    .where(and(eq(reviews.id, reviewId), eq(products.shopId, shopId)))
    .limit(1);

  return row ?? null;
}
