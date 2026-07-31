import { and, asc, count, desc, eq, inArray, type SQL } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn } from '../localized';
import { categories, products, reviews, shopMembers, shops, users } from '../schema';
import {
  categoryImagePath,
  categoryProductCount,
  shopPublishedProductCount,
  shopRatingAvg,
  shopReviewCount,
  shopTotalProductCount,
} from './fragments';

export type ShopDirectoryFilters = {
  categoryId?: string;
  locale: string;
  /** Admin views pass explicit statuses; the storefront only ever sees approved. */
  statuses?: Array<'pending' | 'approved' | 'suspended' | 'closed'>;
};

/**
 * Shop directory (PRD §5.1). Organic order is by rating; directory_top campaigns
 * are fetched separately and rendered above this list (PRD §8.4).
 */
export async function shopDirectory(filters: ShopDirectoryFilters) {
  const conditions: SQL[] = [inArray(shops.status, filters.statuses ?? ['approved'])];
  if (filters.categoryId) conditions.push(eq(shops.categoryId, filters.categoryId));

  const rows = await db
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      status: shops.status,
      description: shops.description,
      categoryId: shops.categoryId,
      categoryName: categories.name,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      verifiedAt: shops.verifiedAt,
      rating: shopRatingAvg,
      reviewCount: shopReviewCount,
      productCount: shopPublishedProductCount,
    })
    .from(shops)
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(shopRatingAvg), asc(localizedColumn(shops.name, filters.locale)));

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
    productCount: Number(row.productCount),
  }));
}

/** Shop page header data (PRD §5.1): profile plus derived rating and counts. */
export async function shopDetail(slug: string) {
  const [row] = await db
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      description: shops.description,
      status: shops.status,
      categoryId: shops.categoryId,
      categoryName: categories.name,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      phone: shops.phone,
      hours: shops.hours,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      // Denormalised, so the badge costs no join on a page that is read far
      // more often than the verification record is written (Prompt C7).
      verifiedAt: shops.verifiedAt,
      rejectionReason: shops.rejectionReason,
      createdAt: shops.createdAt,
      rating: shopRatingAvg,
      reviewCount: shopReviewCount,
      productCount: shopPublishedProductCount,
    })
    .from(shops)
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .where(eq(shops.slug, slug))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
    productCount: Number(row.productCount),
  };
}

export async function shopById(shopId: string) {
  const [row] = await db.select().from(shops).where(eq(shops.id, shopId)).limit(1);
  return row ?? null;
}

/** Admin pending queue (PRD §7.1) — the live approval moment in the demo. */
export async function pendingShops() {
  return db
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      description: shops.description,
      categoryName: categories.name,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      phone: shops.phone,
      createdAt: shops.createdAt,
      draftProductCount: shopTotalProductCount,
      ownerName: users.name,
      ownerPhone: users.phone,
    })
    .from(shops)
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .leftJoin(shopMembers, and(eq(shopMembers.shopId, shops.id), eq(shopMembers.role, 'owner')))
    .leftJoin(users, eq(shopMembers.userId, users.id))
    .where(eq(shops.status, 'pending'))
    .orderBy(asc(shops.createdAt));
}

/**
 * Resolves the shop a user can administer. Drives (dashboard) route protection —
 * a shopkeeper without a shop has nothing to manage.
 */
export async function shopForUser(userId: string) {
  const [row] = await db
    .select({
      shopId: shops.id,
      slug: shops.slug,
      name: shops.name,
      status: shops.status,
      memberRole: shopMembers.role,
    })
    .from(shopMembers)
    .innerJoin(shops, eq(shopMembers.shopId, shops.id))
    .where(eq(shopMembers.userId, userId))
    .orderBy(asc(shopMembers.role))
    .limit(1);

  return row ?? null;
}

/** Staff list for the shopkeeper's settings screen (PRD §6.8). */
export async function shopStaff(shopId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      phone: users.phone,
      role: shopMembers.role,
      active: users.active,
      createdAt: shopMembers.createdAt,
    })
    .from(shopMembers)
    .innerJoin(users, eq(shopMembers.userId, users.id))
    .where(eq(shopMembers.shopId, shopId))
    .orderBy(asc(shopMembers.role), asc(users.name));
}

/** Category tiles with product counts, for the storefront home (PRD §5.1). */
export async function categoryTree(locale: string) {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      sort: categories.sort,
      productCount: categoryProductCount,
      imagePath: categoryImagePath,
    })
    .from(categories)
    .orderBy(asc(categories.sort), asc(localizedColumn(categories.name, locale)));

  const all = rows.map((row) => ({ ...row, productCount: Number(row.productCount) }));
  const roots = all.filter((row) => row.parentId === null);

  return roots.map((root) => ({
    ...root,
    children: all.filter((row) => row.parentId === root.id),
  }));
}

export async function categoryBySlug(slug: string) {
  const [row] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return row ?? null;
}

/** Shop count by status, for the admin overview badges. */
export async function shopCountsByStatus() {
  const rows = await db
    .select({ status: shops.status, total: count() })
    .from(shops)
    .groupBy(shops.status);

  return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)])) as Record<
    string,
    number
  >;
}

/** Product count for a shop, used by the dashboard's "live products" stat. */
export async function publishedProductCount(shopId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(products)
    .where(and(eq(products.shopId, shopId), eq(products.status, 'published')));
  return Number(row?.total ?? 0);
}

/** Reviews across a shop's products (PRD §6.5). */
export async function shopReviews(shopId: string, ratingFilter?: number) {
  const conditions: SQL[] = [eq(products.shopId, shopId)];
  if (ratingFilter) conditions.push(eq(reviews.rating, ratingFilter));

  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      customerName: users.name,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt));
}
