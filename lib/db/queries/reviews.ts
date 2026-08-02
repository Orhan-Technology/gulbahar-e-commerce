import { and, asc, count, desc, eq, isNull, ne, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { DEFAULT_REVIEW_SORT, type ReviewSort } from '../../review-sort';
import {
  orderItems,
  orders,
  productImages,
  productViewDays,
  products,
  reviewResponses,
  reviews,
  shops,
  users,
} from '../schema';

/**
 * Review reads (PRD §5.5).
 *
 * Verified-purchase-only is enforced in two places: the schema's unique index on
 * reviews.order_item_id, and `reviewableOrderItem` below, which is what the UI
 * uses to decide whether to offer a review form at all.
 */

const PAGE_SIZE = 5;

/**
 * How many people found a review useful.
 *
 * Correlated raw SQL with an explicit `reviews.id` on the outer side, for the
 * reason lib/db/queries/fragments.ts documents at length: drizzle renders an
 * interpolated column UNQUALIFIED inside a `sql` template, so both sides of the
 * comparison would resolve to review_votes and the count would be every vote in
 * the table. Cast to int because postgres.js maps bigint to a STRING.
 */
const helpfulCount = sql<number>`(
  select count(*)::int from review_votes rv where rv.review_id = reviews.id
)`;

export type ProductReviewOptions = {
  /** Only this star rating, or null/undefined for all — the histogram filter. */
  stars?: number | null;
  sort?: ReviewSort;
  /** Whose vote to mark as already cast, so the button renders pressed. */
  viewerId?: string | null;
};

/**
 * Visible reviews for a product, with any shopkeeper reply nested.
 *
 * Removed and reported reviews are excluded from the public list; a reported one
 * stays visible to admin in the moderation queue but must not shape what a
 * customer reads (PRD §7.2).
 *
 * THE FILTER AND THE SORT ARE THE SAME QUERY, and both come from the URL. A
 * shopper who clicks the four-star bar has asked a question — what do the people
 * who liked it but did not love it say — and the answer has to be shareable and
 * survive the back button, which client-side filtering of a five-row page could
 * never be.
 *
 * `total` counts the FILTERED set, because it is what paginates; the unfiltered
 * distribution comes from productRatingSummary and is what the bars are drawn
 * from. Conflating the two would shrink every bar the moment a filter was on.
 */
export async function productReviews(
  productId: string,
  page = 1,
  options: ProductReviewOptions = {},
) {
  const { stars = null, sort = DEFAULT_REVIEW_SORT, viewerId = null } = options;

  const conditions: SQL[] = [eq(reviews.productId, productId), eq(reviews.status, 'visible')];
  if (stars) conditions.push(eq(reviews.rating, stars));
  const where = and(...conditions);

  /*
   * Every order falls back to newest-first, so two reviews with the same rating
   * or the same vote count still have a stable, meaningful order rather than
   * whatever the planner returns — which can differ between two loads of the
   * same page and reads as the list shuffling itself.
   */
  const orderBy = {
    recent: [desc(reviews.createdAt)],
    helpful: [desc(helpfulCount), desc(reviews.createdAt)],
    highest: [desc(reviews.rating), desc(reviews.createdAt)],
    lowest: [asc(reviews.rating), desc(reviews.createdAt)],
  }[sort];

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
      helpfulCount,
      // A literal `false` when nobody is signed in, so the column exists either
      // way and the caller needs no branch.
      viewerVoted: viewerId
        ? sql<boolean>`exists (
            select 1 from review_votes rv
            where rv.review_id = reviews.id and rv.user_id = ${viewerId}
          )`
        : sql<boolean>`false`,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
    .leftJoin(shops, eq(reviewResponses.shopId, shops.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(reviews).where(where);

  return {
    items: rows.map((row) => ({
      ...row,
      helpfulCount: Number(row.helpfulCount),
      viewerVoted: Boolean(row.viewerVoted),
    })),
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
 *   - the product has not been ARCHIVED. Archiving is a shopkeeper's delete: the
 *     row survives so the order history stays readable, but the product has no
 *     storefront page left for a review to appear on, and offering the form
 *     would collect an opinion nobody can ever read.
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
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(reviews, eq(reviews.orderItemId, orderItems.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, 'fulfilled'),
        eq(orderItems.productId, productId),
        ne(products.status, 'archived'),
        isNull(reviews.id),
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(1);

  return row ?? null;
}

/**
 * The items on ONE fulfilled order that this customer may still review.
 *
 * The per-PRODUCT counterpart of reviewableShopsForOrder: that one asks how the
 * shop handled the order, this one asks whether the thing in the bag was any
 * good. Both belong on the order page, and they are the highest-yield moment
 * there is to ask — the customer has the item in front of them.
 *
 * The conditions are the ones reviewableOrderItem already enforces, applied to a
 * whole order at once rather than one product at a time: the order is fulfilled
 * and belongs to this user, the line has no review, the customer has not
 * reviewed this product on some other order, and the product still exists on the
 * storefront. `submitReview` re-checks all of it — this decides what to OFFER.
 */
export async function reviewableItemsForOrder(orderId: string, userId: string) {
  return db
    .selectDistinctOn([products.id], {
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      imagePath: sql<string | null>`(
        select pi.path from ${productImages} pi
        where pi.product_id = products.id
        order by pi.sort asc limit 1
      )`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(reviews, eq(reviews.orderItemId, orderItems.id))
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.userId, userId),
        eq(orders.status, 'fulfilled'),
        ne(products.status, 'archived'),
        isNull(reviews.id),
        sql`not exists (
          select 1 from reviews r
          where r.product_id = products.id and r.user_id = ${userId}
        )`,
      ),
    )
    .orderBy(asc(products.id));
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
 *
 * BOTH counters move together, and they answer different questions.
 * `products.view_count` is the lifetime total; `product_view_days` is the time
 * series the dashboard's "views this week" KPI and the reports screen read.
 * Only the seed used to write the daily table, so every real visit during a
 * demo moved the lifetime number while the card labelled "this week" sat
 * still — a KPI that cannot respond to the thing it claims to measure.
 *
 * The day is computed in SQL (`current_date`) rather than in JS: the row is
 * keyed by calendar day, and the database's day is the one every reading query
 * already groups by.
 */
export async function recordProductView(productId: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ viewCount: sql`${products.viewCount} + 1` })
        .where(eq(products.id, productId));

      await tx
        .insert(productViewDays)
        .values({ productId, day: sql`current_date` as unknown as string, views: 1 })
        .onConflictDoUpdate({
          target: [productViewDays.productId, productViewDays.day],
          set: { views: sql`${productViewDays.views} + 1` },
        });
    });
  } catch {
    // Intentionally swallowed.
  }
}
