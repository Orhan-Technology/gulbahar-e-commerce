import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { products } from './products';
import {
  createdAt,
  fulfillmentEnum,
  orderStatusEnum,
  paymentMethodEnum,
  timestampCol,
  type LocalizedText,
} from './shared';
import { shops } from './shops';
import { addresses, users } from './users';

/**
 * An order may span shops (PRD §14) — the cart is multi-shop and grouped by
 * shop at checkout (PRD §5.3). Shop attribution therefore lives on
 * `order_items`, not here.
 *
 * All money columns are integer afghanis (CLAUDE.md).
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-readable, shown to the customer and read aloud in the demo, e.g. GC-24815. */
    reference: text('reference').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: orderStatusEnum('status').notNull().default('placed'),
    fulfillment: fulfillmentEnum('fulfillment').notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    /** Null for pickup orders. */
    addressId: uuid('address_id').references(() => addresses.id, { onDelete: 'set null' }),
    subtotal: integer('subtotal').notNull(),
    discountTotal: integer('discount_total').notNull().default(0),
    deliveryFee: integer('delivery_fee').notNull().default(0),
    total: integer('total').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('orders_reference_key').on(table.reference),
    index('orders_user_idx').on(table.userId),
    index('orders_status_idx').on(table.status),
    index('orders_created_idx').on(table.createdAt),
  ],
);

/**
 * Title and price are snapshotted at purchase time so a later edit or price
 * change never rewrites order history.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'restrict' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    titleSnapshot: jsonb('title_snapshot').$type<LocalizedText>().notNull(),
    priceSnapshot: integer('price_snapshot').notNull(),
    quantity: integer('quantity').notNull(),
    /** Chosen variant labels, e.g. ["قهوه‌ای", "42"]. */
    variantSelection: jsonb('variant_selection').$type<string[]>(),
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId),
    // A shopkeeper only ever sees their own shop's items (PRD §3.1).
    index('order_items_shop_idx').on(table.shopId),
    index('order_items_product_idx').on(table.productId),
  ],
);

/**
 * Append-only status log (PRD §14). Drives the customer tracking timeline and
 * every notification — nothing mutates status without writing a row here.
 *
 * `fromStatus` is null for the initial `placed` event.
 */
export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    /** Null for system-generated transitions (e.g. the demo control panel). */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestampCol('created_at').defaultNow().notNull(),
  },
  (table) => [index('order_events_order_idx').on(table.orderId, table.createdAt)],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type NewOrderEvent = typeof orderEvents.$inferInsert;
