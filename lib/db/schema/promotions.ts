import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { products } from './products';
import {
  campaignStatusEnum,
  createdAt,
  offerScopeEnum,
  offerTypeEnum,
  promotionSlotKeyEnum,
  timestampCol,
  type LocalizedText,
} from './shared';
import { shops } from './shops';

/**
 * Offers — discounts funded by the shop (PRD §8.1). They cost the shop margin,
 * so no admin approval is involved. Distinct from Campaigns below, which are
 * visibility purchased from Gulbahar.
 */
export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    type: offerTypeEnum('type').notNull(),
    /** Percent (1–100) or integer afghanis, depending on `type`. */
    value: integer('value').notNull(),
    scope: offerScopeEnum('scope').notNull().default('products'),
    /** Populated only when scope is 'products'. */
    productIds: jsonb('product_ids').$type<string[]>(),
    startsAt: timestampCol('starts_at').notNull(),
    endsAt: timestampCol('ends_at').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [index('offers_shop_active_idx').on(table.shopId, table.active, table.endsAt)],
);

/**
 * Placement inventory (PRD §8.2). Capacity is the number of concurrent
 * campaigns a slot accepts, which is what caps promoted results so organic
 * results dominate (PRD §8.4).
 *
 * Pricing is a flat fee per week — not CPC, not an auction (PRD §8.3).
 */
export const promotionSlots = pgTable(
  'promotion_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: promotionSlotKeyEnum('key').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    capacity: integer('capacity').notNull(),
    pricePerWeek: integer('price_per_week').notNull(),
  },
  (table) => [uniqueIndex('promotion_slots_key_key').on(table.key)],
);

/**
 * A booking against a slot (PRD §13.3): requested → approved → active → ended.
 *
 * Impressions and clicks are seeded for the demo; real tracking is phase 2
 * (PRD §15).
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => promotionSlots.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    /** Null for shop-level slots such as featured_shops or directory_top. */
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    status: campaignStatusEnum('status').notNull().default('requested'),
    startsAt: timestampCol('starts_at').notNull(),
    endsAt: timestampCol('ends_at').notNull(),
    /** Snapshot of what the shop agreed to pay, so later price changes don't rewrite revenue. */
    pricePaid: integer('price_paid').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    rejectionReason: text('rejection_reason'),
    createdAt: createdAt(),
  },
  (table) => [
    index('campaigns_slot_status_idx').on(table.slotId, table.status),
    index('campaigns_shop_idx').on(table.shopId),
    index('campaigns_window_idx').on(table.status, table.startsAt, table.endsAt),
  ],
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
export type PromotionSlot = typeof promotionSlots.$inferSelect;
export type NewPromotionSlot = typeof promotionSlots.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
