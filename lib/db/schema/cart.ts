import { index, integer, jsonb, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

import { products } from './products';
import { createdAt, updatedAt } from './shared';
import { users } from './users';

/**
 * Persistent cart for signed-in customers.
 *
 * NOT in the PRD §14 data-model outline, but Prompt 5.4 requires the cart to
 * persist "DB for signed-in, cookie for guests, merged at login" — which needs a
 * table. Guests keep their cart in a cookie (see lib/cart.ts); on sign-in the
 * cookie contents are merged into these rows and the cookie is cleared.
 *
 * The cart is multi-shop (PRD §5.3); grouping by shop happens at read time via
 * the product's shop_id rather than being denormalised here, so a product moving
 * shop cannot orphan a cart line.
 */
export const cartItems = pgTable(
  'cart_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    /** Chosen variant labels, mirroring order_items.variant_selection. */
    variantSelection: jsonb('variant_selection').$type<string[]>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.productId] }),
    index('cart_items_user_idx').on(table.userId),
  ],
);

export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
