import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn, searchKey, searchKeyForInput } from '../localized';
import type { LocalizedText } from '../schema/shared';
import { categories, productImages, productVariants, products } from '../schema';
import { productWishlistCount } from './fragments';

/**
 * The shopkeeper's own view of their catalogue (PRD §6.2).
 *
 * Distinct from the public queries: this one includes drafts and unpublished
 * items, so every read is scoped by shopId and must never be reachable from a
 * storefront route.
 */

export type ShopProductFilters = {
  shopId: string;
  locale: string;
  search?: string;
  status?: 'draft' | 'published' | 'unpublished';
  categoryId?: string;
  /** 'out' = zero stock, 'low' = 1..5 — the two states worth acting on. */
  stock?: 'out' | 'low';
};

export const LOW_STOCK_THRESHOLD = 5;

export async function shopCatalogue(filters: ShopProductFilters) {
  const conditions: SQL[] = [eq(products.shopId, filters.shopId)];

  if (filters.status) conditions.push(eq(products.status, filters.status));
  if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  if (filters.stock === 'out') conditions.push(sql`${products.stock} <= 0`);
  if (filters.stock === 'low') {
    conditions.push(sql`${products.stock} > 0 and ${products.stock} <= ${LOW_STOCK_THRESHOLD}`);
  }

  const term = filters.search?.trim();
  if (term) {
    // Matches the slug too, so the dashboard's own deep links (which pass a slug)
    // resolve to a single row.
    conditions.push(
      sql`(${searchKey(products.title)} like '%' || ${searchKeyForInput(term)} || '%'
           or ${products.slug} like '%' || ${term} || '%')`,
    );
  }

  const rows = await db
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
      imagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = products.id
        order by pi.sort asc limit 1
      )`,
      imageCount: sql<number>`(
        select count(*)::int from product_images pi where pi.product_id = products.id
      )`,
      wishlistCount: productWishlistCount,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(localizedColumn(products.title, filters.locale)));

  return rows.map((row) => ({
    ...row,
    imageCount: Number(row.imageCount),
    wishlistCount: Number(row.wishlistCount),
  }));
}

/** Counts per status, for the filter chips' badges. */
export async function shopCatalogueCounts(shopId: string) {
  const rows = await db
    .select({ status: products.status, total: count() })
    .from(products)
    .where(eq(products.shopId, shopId))
    .groupBy(products.status);

  const byStatus = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));

  const [stockRow] = await db
    .select({
      out: sql<number>`count(*) filter (where ${products.stock} <= 0)::int`,
      low: sql<number>`count(*) filter (where ${products.stock} > 0 and ${products.stock} <= ${LOW_STOCK_THRESHOLD})::int`,
    })
    .from(products)
    .where(eq(products.shopId, shopId));

  return {
    all: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
    draft: byStatus.draft ?? 0,
    published: byStatus.published ?? 0,
    unpublished: byStatus.unpublished ?? 0,
    outOfStock: Number(stockRow?.out ?? 0),
    lowStock: Number(stockRow?.low ?? 0),
  };
}

/**
 * One product for the edit form, with its images and variants.
 *
 * Takes shopId as well as id: a shopkeeper editing by URL must not be able to load
 * another tenant's product by guessing an id (PRD §3.1).
 */
export async function shopProductForEdit(shopId: string, productId: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.shopId, shopId)))
    .limit(1);

  if (!row) return null;

  const [images, variants] = await Promise.all([
    db
      .select({ id: productImages.id, path: productImages.path, sort: productImages.sort })
      .from(productImages)
      .where(eq(productImages.productId, row.id))
      .orderBy(asc(productImages.sort)),
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        options: productVariants.options,
        sort: productVariants.sort,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, row.id))
      .orderBy(asc(productVariants.sort)),
  ]);

  return { ...row, images, variants };
}

/** Flat category list for the product form's select (admin-owned taxonomy). */
export async function selectableCategories(locale: string) {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      parentName: sql<LocalizedText | null>`(
        select c2.name from categories c2 where c2.id = categories.parent_id
      )`,
    })
    .from(categories)
    .orderBy(asc(categories.sort), asc(localizedColumn(categories.name, locale)));

  // Only leaves are assignable: a product belongs to "Mobiles", not "Electronics".
  return rows.filter((row) => row.parentId !== null);
}

export async function categoryIdsBySlug(slugs: string[]) {
  if (slugs.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, slugs));
  return new Map(rows.map((row) => [row.slug, row.id]));
}

/** Existing slugs for a shop, so an import can tell create from update. */
export async function shopProductSlugs(shopId: string) {
  const rows = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(eq(products.shopId, shopId));
  return new Map(rows.map((row) => [row.slug, row.id]));
}
