import { index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { orderItems } from './orders';
import { products } from './products';
import { createdAt, reviewStatusEnum } from './shared';
import { shops } from './shops';
import { users } from './users';

/**
 * Verified-purchase reviews (PRD §5.5).
 *
 * The unique constraint on `order_item_id` is the whole enforcement mechanism:
 * a review must point at a specific purchased line, and each line can be
 * reviewed exactly once. Without this the system fills with noise and shops
 * rating each other.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    /** 1–5. Range is enforced by Zod at the action boundary. */
    rating: integer('rating').notNull(),
    body: text('body'),
    status: reviewStatusEnum('status').notNull().default('visible'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('reviews_order_item_key').on(table.orderItemId),
    index('reviews_product_status_idx').on(table.productId, table.status),
    index('reviews_user_idx').on(table.userId),
  ],
);

/** A shopkeeper may respond publicly, once (PRD §5.5) — hence the unique key. */
export const reviewResponses = pgTable(
  'review_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('review_responses_review_key').on(table.reviewId)],
);

/**
 * Saved products. Aggregate counts are exposed to the shopkeeper as a demand
 * signal (PRD §5.6), which is why this is a real table rather than a JSON blob
 * on the user.
 */
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.productId] }),
    index('wishlist_product_idx').on(table.productId),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewResponse = typeof reviewResponses.$inferSelect;
export type NewReviewResponse = typeof reviewResponses.$inferInsert;
export type WishlistItem = typeof wishlistItems.$inferSelect;
export type NewWishlistItem = typeof wishlistItems.$inferInsert;
