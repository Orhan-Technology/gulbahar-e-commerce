import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

import { db } from '..';
import {
  categories,
  offers,
  orderItems,
  orders,
  productImages,
  products,
  shopFollows,
  shopReviewRows,
  shops,
  users,
} from '../schema';

/**
 * Everything the enriched shop page reads (Prompt C8).
 *
 * The merchandising rows are three different questions about the same
 * catalogue — what sells, what people are looking at, what is new — and each
 * renders only with enough items to look deliberate. A "top sellers" rail with
 * two products in it advertises that the shop has sold two things.
 */

/** Below this a row is a stub, and a stub reads as an empty shop. */
export const MIN_ROW_ITEMS = 4;

const cardColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  price: products.price,
  discountPrice: products.discountPrice,
  stock: products.stock,
  shopName: shops.name,
  shopFloor: shops.floor,
  imagePath: sql<string | null>`(
    select pi.path from ${productImages} pi
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
};

/** Top sellers, by units actually fulfilled. */
export async function shopTopSellers(shopId: string, limit = 10) {
  return db
    .select(cardColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.shopId, shopId), eq(products.status, 'published')))
    .orderBy(
      desc(sql`(
        select coalesce(sum(oi.quantity), 0)
        from order_items oi
        join orders o on o.id = oi.order_id
        where oi.product_id = products.id and o.status = 'fulfilled'
      )`),
    )
    .limit(limit);
}

/**
 * Trending, by views in the last seven days.
 *
 * The DAILY ROLL-UP, not the lifetime counter: "what people are looking at" is
 * a question about this week, and `products.view_count` has no time dimension
 * (see lib/db/schema/products.ts).
 */
export async function shopTrending(shopId: string, limit = 10) {
  return db
    .select(cardColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.shopId, shopId), eq(products.status, 'published')))
    .orderBy(
      desc(sql`(
        select coalesce(sum(v.views), 0)
        from product_view_days v
        where v.product_id = products.id and v.day >= current_date - 7
      )`),
    )
    .limit(limit);
}

/** New arrivals. */
export async function shopNewArrivals(shopId: string, limit = 10) {
  return db
    .select(cardColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.shopId, shopId), eq(products.status, 'published')))
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

/** The categories this shop actually stocks, for the in-shop chips. */
export async function shopCategories(shopId: string) {
  return db
    .select({
      slug: categories.slug,
      name: categories.name,
      total: sql<number>`count(*)::int`,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.shopId, shopId), eq(products.status, 'published')))
    .groupBy(categories.slug, categories.name)
    .orderBy(desc(sql`count(*)`));
}

/** This shop's live discounts, for the offers tab. */
export async function shopActiveOffers(shopId: string, now: Date = new Date()) {
  return db
    .select({
      id: offers.id,
      name: offers.name,
      type: offers.type,
      value: offers.value,
      scope: offers.scope,
      productIds: offers.productIds,
      startsAt: offers.startsAt,
      endsAt: offers.endsAt,
    })
    .from(offers)
    .where(
      and(
        eq(offers.shopId, shopId),
        eq(offers.active, true),
        lte(offers.startsAt, now),
        gte(offers.endsAt, now),
      ),
    )
    .orderBy(offers.endsAt);
}

export type ShopReviewView = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  authorName: string;
};

/** Shop-level reviews, newest first. */
export async function shopServiceReviews(shopId: string, limit = 20) {
  return db
    .select({
      id: shopReviewRows.id,
      rating: shopReviewRows.rating,
      body: shopReviewRows.body,
      createdAt: shopReviewRows.createdAt,
      authorName: users.name,
    })
    .from(shopReviewRows)
    .innerJoin(users, eq(shopReviewRows.userId, users.id))
    .where(and(eq(shopReviewRows.shopId, shopId), eq(shopReviewRows.status, 'visible')))
    .orderBy(desc(shopReviewRows.createdAt))
    .limit(limit);
}

/** Aggregate and histogram for the reviews tab. */
export async function shopServiceRating(shopId: string) {
  const rows = await db
    .select({ rating: shopReviewRows.rating, total: sql<number>`count(*)::int` })
    .from(shopReviewRows)
    .where(and(eq(shopReviewRows.shopId, shopId), eq(shopReviewRows.status, 'visible')))
    .groupBy(shopReviewRows.rating);

  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    total: Number(rows.find((row) => row.rating === star)?.total ?? 0),
  }));

  const total = distribution.reduce((sum, entry) => sum + entry.total, 0);
  const average =
    total === 0
      ? 0
      : distribution.reduce((sum, entry) => sum + entry.star * entry.total, 0) / total;

  return { average, total, distribution };
}

/**
 * Whether this customer may review this shop, and for which order.
 *
 * The entitlement is a FULFILLED order from this shop that has not been
 * reviewed yet. Checked here and re-checked in the action: hiding the form is a
 * courtesy, the check is the rule (PRD §5.5).
 */
export async function reviewableOrderForShop(userId: string | undefined, shopId: string) {
  if (!userId) return null;

  const [row] = await db
    .select({ orderId: orders.id, reference: orders.reference })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.shopId, shopId),
        eq(orders.status, 'fulfilled'),
        sql`not exists (
          select 1 from shop_reviews sr
          where sr.order_id = orders.id and sr.shop_id = ${shopId}
        )`,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  return row ?? null;
}

/** Follower count, and whether this viewer is one of them. */
export async function shopFollowState(shopId: string, userId: string | undefined) {
  const [counts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(shopFollows)
    .where(eq(shopFollows.shopId, shopId));

  if (!userId) return { total: Number(counts?.total ?? 0), following: false };

  const [mine] = await db
    .select({ userId: shopFollows.userId })
    .from(shopFollows)
    .where(and(eq(shopFollows.shopId, shopId), eq(shopFollows.userId, userId)))
    .limit(1);

  return { total: Number(counts?.total ?? 0), following: Boolean(mine) };
}

/** The shops a customer follows, for their account hub. */
export async function followedShops(userId: string) {
  return db
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      verifiedAt: shops.verifiedAt,
      /** Vacation mode, so a followed shop that is shut says so here too. */
      pausedUntil: shops.pausedUntil,
      /** When this customer started following — the "new since" line below. */
      followedAt: shopFollows.createdAt,
      productCount: sql<number>`(
        select count(*)::int from products p
        where p.shop_id = shops.id and p.status = 'published'
      )`,
    })
    .from(shopFollows)
    .innerJoin(shops, eq(shopFollows.shopId, shops.id))
    .where(and(eq(shopFollows.userId, userId), ne(shops.status, 'closed')))
    .orderBy(desc(shopFollows.createdAt));
}

/** Where the feed stops for one shop — enough to be a row, not a catalogue. */
const FOLLOW_FEED_PER_SHOP = 4;

/**
 * What following a shop actually GETS you (Prompt: follow is a dead loop).
 *
 * Following was a button with nothing behind it: a row in a table, a count on a
 * hero, and no surface anywhere that answered "so what". This is the answer —
 * for each followed shop, what it has added and what it is discounting right
 * now, which is the only reason a customer would have pressed the button.
 *
 * `since` is the FOLLOW date, so "new" means new to this reader rather than new
 * in absolute terms. A shop that has not listed anything in six months should
 * not look busy to someone who followed it yesterday, and a shop that added
 * three products the day after they followed should.
 *
 * The products are fetched for every followed shop in ONE query and grouped in
 * JS rather than with a lateral join per shop. The bound is the number of shops
 * a person follows — single digits — and the catalogue behind each is small, so
 * the cost of the simple version is a rounding error and it stays readable.
 *
 * `now` is a parameter for the same reason it is everywhere else: this is read
 * during render and React 19 forbids a clock read there (CLAUDE.md).
 */
export async function followedShopsFeed(userId: string, now: Date) {
  const followed = await followedShops(userId);
  if (followed.length === 0) return [];

  const shopIds = followed.map((shop) => shop.id);

  const [latest, liveOffers] = await Promise.all([
    db
      .select({
        shopId: products.shopId,
        id: products.id,
        slug: products.slug,
        title: products.title,
        price: products.price,
        discountPrice: products.discountPrice,
        stock: products.stock,
        createdAt: products.createdAt,
        shopName: shops.name,
        shopFloor: shops.floor,
        imagePath: sql<string | null>`(
          select pi.path from ${productImages} pi
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
      })
      .from(products)
      .innerJoin(shops, eq(products.shopId, shops.id))
      // 'published' excludes drafts, unpublished AND archived — a shopkeeper's
      // delete must never reach a storefront surface.
      .where(and(inArray(products.shopId, shopIds), eq(products.status, 'published')))
      .orderBy(desc(products.createdAt)),

    db
      .select({
        shopId: offers.shopId,
        id: offers.id,
        name: offers.name,
        type: offers.type,
        value: offers.value,
        endsAt: offers.endsAt,
      })
      .from(offers)
      .where(
        and(
          inArray(offers.shopId, shopIds),
          eq(offers.active, true),
          lte(offers.startsAt, now),
          gte(offers.endsAt, now),
        ),
      )
      .orderBy(asc(offers.endsAt)),
  ]);

  return followed.map((shop) => {
    const shopProducts = latest.filter((row) => row.shopId === shop.id);
    return {
      ...shop,
      products: shopProducts.slice(0, FOLLOW_FEED_PER_SHOP),
      /* Counted over the WHOLE catalogue, not the four rendered: "۲ محصول تازه"
         under a row of four is a contradiction the reader has to resolve. */
      newSinceFollow: shopProducts.filter((row) => row.createdAt > shop.followedAt).length,
      offers: liveOffers.filter((row) => row.shopId === shop.id),
    };
  });
}

/**
 * Which shops on THIS order the customer may still review (Prompt C8).
 *
 * The order detail page is where the prompt belongs — it is the moment someone
 * has just had the experience, and it is the only screen that knows which shops
 * were involved. A basket that spanned three shops asks about all three, one at
 * a time, because they handled it separately.
 */
export async function reviewableShopsForOrder(orderId: string, userId: string) {
  const rows = await db
    .selectDistinct({
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(shops, eq(orderItems.shopId, shops.id))
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.userId, userId),
        eq(orders.status, 'fulfilled'),
        sql`not exists (
          select 1 from shop_reviews sr
          where sr.order_id = ${orderId} and sr.shop_id = shops.id
        )`,
      ),
    );

  return rows;
}
