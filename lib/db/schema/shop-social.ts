import { index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { orders } from './orders';
import { createdAt, reviewStatusEnum } from './shared';
import { shops } from './shops';
import { users } from './users';

/**
 * Reviews of the SHOP, not of a product (Prompt C8).
 *
 * A separate table rather than a nullable `product_id` on `reviews`, because
 * they answer different questions and are earned differently. A product review
 * is about the thing; a shop review is about the service — did they answer the
 * phone, was it packed properly, was it ready when they said. Folding them
 * together would mean one aggregate rating that means neither, and every query
 * on the product page would grow a `where product_id is not null`.
 *
 * The verified-purchase rule survives, tied to an ORDER rather than an order
 * item: you review a shop for how it handled an order. The unique key is
 * (order, shop) and not the order alone, because a Gulbahar basket can span
 * three shops on two floors and each of them handled it separately — one of
 * them may have called ahead while another kept you waiting, and a key on the
 * order would silently let only the first of the three be reviewed.
 *
 * A customer with four orders from the same shop can review it four times,
 * which is also right: each is about a different experience.
 */
export const shopReviewRows = pgTable(
  'shop_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The fulfilled order this review is about — the entitlement. */
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** 1–5, checked at the action boundary. */
    rating: integer('rating').notNull(),
    body: text('body'),
    status: reviewStatusEnum('status').notNull().default('visible'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('shop_reviews_order_shop_key').on(table.orderId, table.shopId),
    index('shop_reviews_shop_status_idx').on(table.shopId, table.status),
    index('shop_reviews_user_idx').on(table.userId),
  ],
);

/**
 * Following a shop (Prompt C8).
 *
 * A composite primary key rather than a surrogate id: the row IS the
 * relationship, there is exactly one per pair, and a uuid would only give
 * something to accidentally duplicate.
 *
 * This is what turns a marketplace into a habit — and in C12 it is what a
 * "new product from a shop you follow" notification reads from.
 */
export const shopFollows = pgTable(
  'shop_follows',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.shopId] }),
    // "Who follows this shop" — the direction C12's notifications fan out in.
    index('shop_follows_shop_idx').on(table.shopId),
  ],
);

export type ShopReviewRow = typeof shopReviewRows.$inferSelect;
export type ShopFollow = typeof shopFollows.$inferSelect;
