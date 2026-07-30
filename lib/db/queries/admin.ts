import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn } from '../localized';
import {
  categories,
  productImages,
  products,
  reviewResponses,
  reviews,
  shopMembers,
  shops,
  users,
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

export type AdminProductFilters = {
  shopId?: string;
  status?: 'draft' | 'published' | 'unpublished';
  search?: string;
  locale: string;
  limit?: number;
};

/** Cross-platform product list. Read plus unpublish only — never edit (PRD §3.1). */
export async function adminProducts(filters: AdminProductFilters) {
  const conditions: SQL[] = [];
  if (filters.shopId) conditions.push(eq(products.shopId, filters.shopId));
  if (filters.status) conditions.push(eq(products.status, filters.status));

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

/** Shop options for the product filter. */
export async function adminShopOptions(locale: string) {
  return db
    .select({ id: shops.id, name: shops.name, slug: shops.slug })
    .from(shops)
    .orderBy(asc(localizedColumn(shops.name, locale)));
}

/* -------------------------------------------------------------------------- */
/* Review moderation                                                          */

/**
 * The moderation queue (PRD §7.2).
 *
 * Shown in CONTEXT — the product, the rating, the shop's reply if there is one —
 * because "remove or uphold" is not a decision anyone can make from a body of text
 * alone.
 */
export async function adminReviewQueue(status: 'reported' | 'removed' | 'visible' = 'reported') {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      authorName: users.name,
      authorPhone: users.phone,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      shopName: shops.name,
      shopSlug: shops.slug,
      responseBody: reviewResponses.body,
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
