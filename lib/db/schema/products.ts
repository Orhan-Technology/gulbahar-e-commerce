import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { categories } from './categories';
import { createdAt, productStatusEnum, type LocalizedText } from './shared';
import { shops } from './shops';

/** One row of the product page's spec table. */
export type ProductSpec = {
  /** Label key under the `product.specs` message namespace. */
  key: string;
  value: LocalizedText;
};

/**
 * Shop-owned content (PRD §3.1). Admin can unpublish but never edit — that is
 * enforced in the server actions, not here.
 *
 * Prices are integer afghanis; there are no sub-unit amounts (CLAUDE.md).
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: jsonb('title').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    price: integer('price').notNull(),
    /** Null when not discounted. Only counts when strictly below `price`. */
    discountPrice: integer('discount_price'),
    stock: integer('stock').notNull().default(0),
    /**
     * Spec table on the product page (PRD §5.2): an ORDERED list, because
     * "screen, storage, memory, battery" is a reading order a keyed object
     * would lose. `key` names a translated label in product.specs.*, so the
     * label is localised once and only the value is per-product.
     *
     * Null for the many products that have nothing to tabulate — a bag has a
     * description, not specifications — and the section is then absent rather
     * than an empty table.
     */
    specs: jsonb('specs').$type<ProductSpec[]>(),
    status: productStatusEnum('status').notNull().default('draft'),
    /** Seeded view counter backing the dashboard's top-products table (PRD §6.1). */
    viewCount: integer('view_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('products_slug_key').on(table.slug),
    // The two access patterns from PRD §14: a shop's own list, and public
    // browsing within a category.
    index('products_shop_status_idx').on(table.shopId, table.status),
    index('products_category_status_idx').on(table.categoryId, table.status),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Path under /public, written by lib/images.ts storeImage(). */
    path: text('path').notNull(),
    sort: integer('sort').notNull().default(0),
    alt: jsonb('alt').$type<LocalizedText>(),
  },
  (table) => [index('product_images_product_idx').on(table.productId, table.sort)],
);

/**
 * Variants are a named axis plus its options, e.g.
 * `{ name: {fa: 'رنگ'}, options: ['سیاه', 'سفید'] }`.
 *
 * Deliberately not a full variant matrix with per-combination stock: the demo
 * shows size/colour selection, and per-variant inventory is phase-2 work that
 * would complicate every order path (PRD §15).
 */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    options: jsonb('options').$type<LocalizedText[]>().notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (table) => [index('product_variants_product_idx').on(table.productId, table.sort)],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
