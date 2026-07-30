import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { categories } from './categories';
import { createdAt, productStatusEnum, type LocalizedText } from './shared';
import { shops } from './shops';

/**
 * One row of the product page's specification table (Prompt P1).
 *
 * An ORDERED array rather than a keyed object, because "screen, storage,
 * memory, battery" is an editorial reading order that a map would lose on the
 * first round-trip through JSON.
 *
 * `key` is the COMPARISON AXIS — it is what lets the compare-similar-products
 * table line four products up row by row — and it is stable across locales and
 * shops because the category templates in lib/product-templates.ts define it.
 * `label` travels WITH the row rather than being looked up from a message key,
 * which the earlier `specs` column did: a shopkeeper adding a custom row of
 * their own has no way to add a message key, and a spec table where custom rows
 * render as `product.specs.myThing` is worse than no custom rows at all.
 *
 * `group` is optional and only earns its place once a product has enough rows
 * to need sub-headings (General / Design / Size).
 */
export type ProductAttribute = {
  key: string;
  label: LocalizedText;
  value: LocalizedText;
  group?: string;
};

/** A bulleted selling point: a bold title and one sentence under it. */
export type ProductFeature = {
  title: LocalizedText;
  body: LocalizedText;
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
     * Specification rows (PRD §5.2, Prompt P1). Null only for a product whose
     * owner has not filled the template yet; the section is then absent rather
     * than an empty table, and a product missing ONE key simply omits that row
     * — never a rendered "N/A", which reads as a broken import.
     */
    attributes: jsonb('attributes').$type<ProductAttribute[]>(),
    /** The bulleted selling points above the spec table (Prompt P1). */
    features: jsonb('features').$type<ProductFeature[]>(),
    /**
     * Brand and model are their own columns rather than two more attribute
     * rows: the brand drives a listing facet and both appear in the buy box
     * under the title, so they are queried and rendered independently of
     * whether the owner filled in the rest of the template.
     */
    brand: text('brand'),
    model: text('model'),
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
    index('products_brand_idx').on(table.brand),
  ],
);

/**
 * Daily view counts per product (PRD §6.1).
 *
 * `products.view_count` is a LIFETIME integer with no time dimension, so a
 * dashboard KPI reading "views this week" cannot be derived from it — and a
 * card that says "this week" over a lifetime total is a number that lies on
 * the client's screen. This is the time series behind it: one row per product
 * per day it was seen, which also gives the week-over-week delta the card
 * shows and, later, a views trend on the reports screen.
 *
 * A daily ROLL-UP rather than an event log. The demo has no analytics service
 * and never will (CLAUDE.md), so the only consumer is "sum a date range" —
 * and per-view rows would be tens of thousands of them to answer a question
 * that thirty-five rows per product already answers exactly.
 *
 * `day` is a DATE, not a timestamp: the boundary a shopkeeper means by "this
 * week" is a calendar day, and storing it as one makes the primary key do the
 * de-duplication for free.
 */
export const productViewDays = pgTable(
  'product_view_days',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    views: integer('views').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.day] }),
    // The dashboard reads a window across a shop's whole catalogue, so the
    // date leads: it is the selective column in every query that touches this.
    index('product_view_days_day_idx').on(table.day),
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
    /**
     * A 16px WebP data URI for `<Image placeholder="blur">` (Prompt P2).
     *
     * Stored rather than derived: it is a property of the file and never
     * changes, and computing it per request would put sharp on the render path.
     * Nullable because an image uploaded before this column existed has none,
     * and a missing placeholder degrades to the tinted box it already had.
     */
    blurDataUrl: text('blur_data_url'),
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
