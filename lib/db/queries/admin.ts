import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn } from '../localized';
import {
  categories,
  orders,
  productImages,
  products,
  reviewResponses,
  reviews,
  shopMembers,
  shops,
  users,
  type OrderStatus,
  type ShopStatus,
} from '../schema';
import {
  categoryProductCount,
  shopPublishedProductCount,
  shopTotalProductCount,
} from './fragments';

/**
 * Reads for the admin surface (PRD §7).
 *
 * Admin sees ACROSS shops, which is the one place in this codebase where a query
 * deliberately has no shop scope. The compensating rule is that admin's WRITE
 * surface is narrow by design (PRD §3.1): approve, unpublish, moderate — never
 * edit shop content. That asymmetry lives in lib/actions/admin-*.ts; these
 * queries only ever read.
 */

/* -------------------------------------------------------------------------- */
/* Header badges                                                              */

/** Everything the admin header counts, in one round trip. */
export async function adminPendingCounts() {
  const [row] = await db
    .select({
      pendingShops: sql<number>`(select count(*)::int from shops where status = 'pending')`,
      reportedReviews: sql<number>`(select count(*)::int from reviews where status = 'reported')`,
      requestedCampaigns: sql<number>`(select count(*)::int from campaigns where status = 'requested')`,
      placedOrders: sql<number>`(select count(*)::int from orders where status = 'placed')`,
    })
    .from(sql`(select 1) as one`);

  return row ?? { pendingShops: 0, reportedReviews: 0, requestedCampaigns: 0, placedOrders: 0 };
}

/**
 * Promotion revenue over a window — what Gulbahar earned from paid placement
 * (PRD §7.3, §8.2).
 *
 * Sums `price_paid`, the snapshot taken when the campaign was booked, not the
 * slot's current rate: a later price change must not rewrite past revenue.
 * Requested and rejected campaigns are excluded — nothing was sold.
 */
export async function platformPromotionRevenue(days: number) {
  // Day count, not a Date — see platformStats in queries/orders.ts.
  const since = new Date(Date.now() - days * 86_400_000);
  const [row] = await db
    .select({
      revenue: sql<number>`coalesce(sum(c.price_paid) filter (
        where c.status in ('active','ended','approved') and c.starts_at >= ${since.toISOString()}::timestamptz
      ), 0)::int`,
      campaignCount: sql<number>`count(*) filter (
        where c.status in ('active','ended','approved') and c.starts_at >= ${since.toISOString()}::timestamptz
      )::int`,
    })
    .from(sql`campaigns c`);

  return { revenue: Number(row?.revenue ?? 0), campaignCount: Number(row?.campaignCount ?? 0) };
}

/* -------------------------------------------------------------------------- */
/* Shops                                                                      */

export type AdminShopFilters = {
  status?: ShopStatus;
  search?: string;
  locale: string;
};

export async function adminShopDirectory(filters: AdminShopFilters) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(shops.status, filters.status));

  const term = filters.search?.trim();
  if (term) {
    // Slug and the localised name, which is what an admin actually types.
    const pattern = `%${term}%`;
    conditions.push(
      or(
        ilike(shops.slug, pattern),
        ilike(localizedColumn(shops.name, filters.locale), pattern),
      ) as SQL,
    );
  }

  return db
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      status: shops.status,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      phone: shops.phone,
      logoPath: shops.logoPath,
      createdAt: shops.createdAt,
      /*
       * Vacation mode, set by the shopkeeper. Admin never writes it — it is
       * read so a quiet shop is not mistaken for an abandoned one.
       *
       * "Is it paused RIGHT NOW" is answered in SQL rather than by comparing
       * the date in the component: a React 19 component may not call
       * `Date.now()` during render, server or not, and the lint rule enforces
       * it. The clock read belongs to the query (CLAUDE.md).
       */
      pausedUntil: shops.pausedUntil,
      paused: sql<boolean>`${shops.pausedUntil} is not null and ${shops.pausedUntil} > now()`,
      categoryName: categories.name,
      publishedProducts: shopPublishedProductCount,
      totalProducts: shopTotalProductCount,
      ownerName: users.name,
      ownerPhone: users.phone,
    })
    .from(shops)
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .leftJoin(shopMembers, and(eq(shopMembers.shopId, shops.id), eq(shopMembers.role, 'owner')))
    .leftJoin(users, eq(shopMembers.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(shops.status), asc(localizedColumn(shops.name, filters.locale)));
}

/**
 * Everything a shop built, for the approval review screen (PRD §7.1).
 *
 * Includes DRAFT products with their images: the whole point of letting a pending
 * shop build its catalogue is that the reviewer can see it before approving. A
 * review screen showing only the profile would make approval a rubber stamp.
 */
export async function adminShopReview(shopId: string) {
  /*
   * `shops.id` is a uuid column, so ANY non-uuid string reaching it is not a
   * miss — it is a Postgres type error, surfacing as an unreadable "Failed
   * query" with no hint that the input was the problem. A slug is the thing
   * that actually turns up here: the route is `[id]`, the public one is
   * `[slug]`, and a link built with the wrong one has slipped in twice now.
   *
   * Returning null lets the page 404, which is the honest answer for an
   * address that names no shop.
   */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)) {
    return null;
  }

  const [shop] = await db
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      description: shops.description,
      status: shops.status,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      phone: shops.phone,
      hours: shops.hours,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      rejectionReason: shops.rejectionReason,
      // Vacation mode, the shopkeeper's own switch — read-only here, and the
      // "is it in force now" comparison is done in SQL for the reason above.
      pausedUntil: shops.pausedUntil,
      paused: sql<boolean>`${shops.pausedUntil} is not null and ${shops.pausedUntil} > now()`,
      pauseNote: shops.pauseNote,
      createdAt: shops.createdAt,
      categoryName: categories.name,
      ownerId: users.id,
      ownerName: users.name,
      ownerPhone: users.phone,
      ownerLocale: users.locale,
    })
    .from(shops)
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .leftJoin(shopMembers, and(eq(shopMembers.shopId, shops.id), eq(shopMembers.role, 'owner')))
    .leftJoin(users, eq(shopMembers.userId, users.id))
    .where(eq(shops.id, shopId))
    .limit(1);

  if (!shop) return null;

  const catalogue = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      status: products.status,
      imagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = products.id
        order by pi.sort asc limit 1
      )`,
      imageCount: sql<number>`(
        select count(*)::int from product_images pi where pi.product_id = products.id
      )`,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.shopId, shopId))
    .orderBy(asc(products.createdAt));

  return { ...shop, catalogue };
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */

/**
 * The taxonomy as a tree, with the product counts that decide whether a node may
 * be deleted (PRD §7.2).
 *
 * `directProductCount` counts products pointing at THIS node whatever their
 * status — unlike the public categoryProductCount, which only counts what a
 * customer can see. Deleting a category referenced by a draft product would
 * orphan it just as surely.
 */
export async function adminCategoryTree(locale: string) {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      sort: categories.sort,
      publicProductCount: categoryProductCount,
      directProductCount: sql<number>`(
        select count(*)::int from products p where p.category_id = categories.id
      )`,
      childCount: sql<number>`(
        select count(*)::int from categories c where c.parent_id = categories.id
      )`,
      shopCount: sql<number>`(
        select count(*)::int from shops s where s.category_id = categories.id
      )`,
    })
    .from(categories)
    .orderBy(asc(categories.sort), asc(localizedColumn(categories.name, locale)));

  const roots = rows.filter((row) => row.parentId === null);
  return roots.map((root) => ({
    ...root,
    children: rows.filter((row) => row.parentId === root.id),
  }));
}

/* -------------------------------------------------------------------------- */
/* Products                                                                   */

export type AdminProductStatusFilter = 'draft' | 'published' | 'unpublished' | 'archived';

export type AdminProductFilters = {
  shopId?: string;
  status?: AdminProductStatusFilter;
  search?: string;
  locale: string;
  limit?: number;
};

/** Cross-platform product list. Read plus unpublish only — never edit (PRD §3.1). */
export async function adminProducts(filters: AdminProductFilters) {
  const conditions: SQL[] = [];
  if (filters.shopId) conditions.push(eq(products.shopId, filters.shopId));
  if (filters.status) conditions.push(eq(products.status, filters.status));
  /*
   * ARCHIVED IS A SHOPKEEPER'S DELETE, so it is out of every unfiltered view.
   * The row survives because orders reference it, but a listing the shop has
   * thrown away is not part of the catalogue admin governs — and leaving it in
   * the default list would put "unpublish" beside products that are already
   * gone. It stays reachable under its own chip, and only there.
   */
  else conditions.push(sql`${products.status} <> 'archived'`);

  const term = filters.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    conditions.push(
      or(
        ilike(products.slug, pattern),
        ilike(localizedColumn(products.title, filters.locale), pattern),
      ) as SQL,
    );
  }

  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      status: products.status,
      stock: products.stock,
      viewCount: products.viewCount,
      createdAt: products.createdAt,
      shopId: shops.id,
      shopName: shops.name,
      shopSlug: shops.slug,
      shopStatus: shops.status,
      imagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = products.id
        order by pi.sort asc limit 1
      )`,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(products.createdAt))
    .limit(filters.limit ?? 100);
}

/** Shop options for the product and order filters. */
export async function adminShopOptions(locale: string) {
  return db
    .select({ id: shops.id, name: shops.name, slug: shops.slug })
    .from(shops)
    .orderBy(asc(localizedColumn(shops.name, locale)));
}

/** How many products sit in each status — the counts on the filter chips. */
export async function adminProductStatusCounts(shopId?: string) {
  const rows = await db
    .select({ status: products.status, total: count() })
    .from(products)
    .where(shopId ? eq(products.shopId, shopId) : undefined)
    .groupBy(products.status);

  const map = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  const published = map.published ?? 0;
  const draft = map.draft ?? 0;
  const unpublished = map.unpublished ?? 0;
  const archived = map.archived ?? 0;

  return {
    // "All" excludes archived, exactly as the list does — a chip counting rows
    // the list will not show is the kind of disagreement that makes an admin
    // stop trusting both numbers.
    all: published + draft + unpublished,
    published,
    draft,
    unpublished,
    archived,
  };
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */

export type AdminOrderFilters = {
  statuses?: OrderStatus[];
  /** Reference, customer name, or customer phone — one box, three columns. */
  search?: string;
  shopId?: string;
  /** Days back from now; undefined means every order ever placed. */
  days?: number;
  limit?: number;
};

/**
 * The all-orders list with its filters (PRD §7.4).
 *
 * `allOrders()` in queries/orders.ts took a status array and a limit and
 * nothing else, so the admin screen had no way to answer "where is GC-24788"
 * or "what has Pamir Shoes been doing this week" other than paging through two
 * hundred rows by eye. This is that query with the three axes an admin
 * actually arrives with: who, when, and which shop.
 *
 * The shop filter is an EXISTS rather than a join: an order spanning two shops
 * must appear once under each of them, and a join would duplicate the row on
 * every unfiltered view.
 *
 * `hasMore` is derived from one extra row, so the screen can say honestly that
 * it is showing the first N rather than implying it is showing everything.
 */
export async function adminOrderList(filters: AdminOrderFilters) {
  const limit = Math.min(filters.limit ?? 100, 500);
  const conditions: SQL[] = [];

  if (filters.statuses?.length) conditions.push(inArray(orders.status, filters.statuses));
  if (filters.shopId) {
    conditions.push(
      sql`exists (select 1 from order_items oi where oi.order_id = ${orders.id} and oi.shop_id = ${filters.shopId})`,
    );
  }
  if (filters.days) {
    // A day count, not a Date: the clock is read inside the query, never in a
    // component (CLAUDE.md).
    conditions.push(sql`${orders.createdAt} >= now() - (${filters.days} * interval '1 day')`);
  }

  const term = filters.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    conditions.push(
      or(
        ilike(orders.reference, pattern),
        ilike(users.name, pattern),
        ilike(users.phone, pattern),
      ) as SQL,
    );
  }

  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      paymentMethod: orders.paymentMethod,
      total: orders.total,
      createdAt: orders.createdAt,
      customerName: users.name,
      customerPhone: users.phone,
      shopCount: sql<number>`(
        select count(distinct oi.shop_id)::int from order_items oi where oi.order_id = orders.id
      )`,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit + 1);

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, limit };
}

/** How many orders sit in each status — the counts on the order filter chips. */
export async function adminOrderStatusCounts() {
  const rows = await db.select({ status: orders.status, total: count() }).from(orders).groupBy(orders.status);
  const map = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));

  return {
    all: Object.values(map).reduce((sum, value) => sum + Number(value), 0),
    placed: map.placed ?? 0,
    accepted: map.accepted ?? 0,
    ready: map.ready ?? 0,
    fulfilled: map.fulfilled ?? 0,
    rejected: map.rejected ?? 0,
    cancelled: map.cancelled ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Review moderation                                                          */

/**
 * The moderation queue (PRD §7.2).
 *
 * Shown in CONTEXT — the product, the rating, the shop's reply if there is one —
 * because "remove or uphold" is not a decision anyone can make from a body of text
 * alone.
 *
 * WHY THE REPORT REASON IS A SUBQUERY AGAINST NOTIFICATIONS, and not a column:
 * `reviews` has no reporter and no reason field, and the schema is fixed. A shop
 * flagging a review picks a category from a fixed list, and `flagReview()` in
 * lib/actions/shop-reviews.ts sends that category to the admin queue as a
 * NOTIFICATION payload — which is the only place it is recorded. That payload
 * carries the product title and the shop name but NOT the review id, so the
 * report can only be tied back to a review when the pairing is unambiguous.
 *
 * Hence the `= 1` guard: the reason is attached only when the product has
 * exactly ONE reported review, in which case there is nothing else the report
 * could be about. A product with two reported reviews shows no reason on either,
 * because a plausible guess on a moderation decision is worse than a blank.
 * (The real fix is one line in flagReview — see the report.)
 *
 * The AUTHOR'S RECORD comes with it either way, so the decision is never
 * context-free even when the reason is missing: how many reviews this person has
 * standing, and how many of theirs have already been taken down. One removal
 * among forty reviews is a bad night; three among four is a pattern.
 */
export async function adminReviewQueue(status: 'reported' | 'removed' | 'visible' = 'reported') {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      authorId: reviews.userId,
      authorName: users.name,
      authorPhone: users.phone,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      shopName: shops.name,
      shopSlug: shops.slug,
      responseBody: reviewResponses.body,
      authorVisibleReviews: sql<number>`(
        select count(*)::int from reviews r2
        where r2.user_id = ${reviews.userId} and r2.status = 'visible'
      )`,
      authorRemovedReviews: sql<number>`(
        select count(*)::int from reviews r2
        where r2.user_id = ${reviews.userId} and r2.status = 'removed'
      )`,
      reportReason: sql<string | null>`(
        select n.payload->>'reason'
        from notifications n
        where n.event_key = 'review.flagged'
          and n.payload->>'reviewId' = ${reviews.id}::text
        order by n.created_at desc
        limit 1
      )`,
      reportNote: sql<string | null>`(
        select nullif(n.payload->>'note', '')
        from notifications n
        where n.event_key = 'review.flagged'
          and n.payload->>'reviewId' = ${reviews.id}::text
        order by n.created_at desc
        limit 1
      )`,
      // A STRING, not a Date: this arrives through a raw `sql` fragment rather
      // than a typed column, so postgres.js hands back the timestamp as text
      // and drizzle has no column to coerce it with. Declaring `Date` here
      // would type-check and then fail on `.toISOString()` at runtime.
      reportedAt: sql<string | null>`(
        select n.created_at
        from notifications n
        where n.event_key = 'review.flagged'
          and n.payload->>'reviewId' = ${reviews.id}::text
        order by n.created_at desc
        limit 1
      )`,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .innerJoin(shops, eq(products.shopId, shops.id))
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
    .where(eq(reviews.status, status))
    .orderBy(desc(reviews.createdAt));
}

export async function adminReviewCounts() {
  const rows = await db
    .select({ status: reviews.status, total: count() })
    .from(reviews)
    .groupBy(reviews.status);

  const map = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  return {
    visible: map.visible ?? 0,
    reported: map.reported ?? 0,
    removed: map.removed ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */

export type AdminUserFilters = {
  role?: 'customer' | 'shopkeeper' | 'admin';
  search?: string;
  limit?: number;
};

export async function adminUsers(filters: AdminUserFilters) {
  const conditions: SQL[] = [];
  if (filters.role) conditions.push(eq(users.role, filters.role));

  const term = filters.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    conditions.push(or(ilike(users.phone, pattern), ilike(users.name, pattern)) as SQL);
  }

  return db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      locale: users.locale,
      active: users.active,
      createdAt: users.createdAt,
      shopName: shops.name,
      shopSlug: shops.slug,
      orderCount: sql<number>`(select count(*)::int from orders o where o.user_id = users.id)`,
      /*
       * Activity summary (Prompt A4). Two correlated counts rather than two
       * joins: a join to orders AND reviews multiplies the rows against each
       * other, and the shop join above already makes this a one-to-many.
       */
      reviewCount: sql<number>`(select count(*)::int from reviews r where r.user_id = users.id and r.status = 'visible')`,
      lastOrderAt: sql<Date | null>`(select max(o.created_at) from orders o where o.user_id = users.id)`,
    })
    .from(users)
    .leftJoin(shopMembers, eq(shopMembers.userId, users.id))
    .leftJoin(shops, eq(shopMembers.shopId, shops.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(users.role), desc(users.createdAt))
    .limit(filters.limit ?? 200);
}

export async function adminUserCounts() {
  const rows = await db
    .select({ role: users.role, total: count() })
    .from(users)
    .groupBy(users.role);
  const map = Object.fromEntries(rows.map((row) => [row.role, Number(row.total)]));
  return {
    all: Object.values(map).reduce((sum, value) => sum + Number(value), 0),
    customer: map.customer ?? 0,
    shopkeeper: map.shopkeeper ?? 0,
    admin: map.admin ?? 0,
  };
}

/* -------------------------------------------------------------------------- */

/** Used by the approve action to notify every member of the shop. */
export async function shopOwnerAndStaff(shopId: string) {
  return db
    .select({ id: users.id, locale: users.locale, role: shopMembers.role })
    .from(shopMembers)
    .innerJoin(users, eq(shopMembers.userId, users.id))
    .where(eq(shopMembers.shopId, shopId));
}

/** Image paths for a set of products, so the review screen can show a contact sheet. */
export async function productImagePaths(productIds: string[]) {
  if (productIds.length === 0) return [];
  return db
    .select({ productId: productImages.productId, path: productImages.path })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sort));
}
