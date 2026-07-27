import {
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
import { createdAt, shopMemberRoleEnum, shopStatusEnum, type LocalizedText } from './shared';
import { users } from './users';

/**
 * A Gulbahar Center tenant (PRD §14).
 *
 * A pending shop can build everything — products, prices, profile — but is not
 * public. Approval flips `status` only; nothing else changes (PRD §7.1).
 *
 * Floor and unit are metadata for in-store pickup, not a browsing axis (PRD §4).
 */
export const shops = pgTable(
  'shops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    status: shopStatusEnum('status').notNull().default('pending'),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    floor: integer('floor'),
    unitNumber: text('unit_number'),
    phone: text('phone'),
    hours: text('hours'),
    logoPath: text('logo_path'),
    bannerPath: text('banner_path'),
    /** Written by admin on reject; visible to the shopkeeper so they can amend. */
    rejectionReason: text('rejection_reason'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('shops_slug_key').on(table.slug),
    index('shops_status_idx').on(table.status),
    index('shops_category_idx').on(table.categoryId, table.status),
  ],
);

/**
 * user ↔ shop join. Cheap now, painful later (PRD §14) — a shop has one owner
 * plus optional staff, and staff need scoped access to the same dashboard.
 */
export const shopMembers = pgTable(
  'shop_members',
  {
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: shopMemberRoleEnum('role').notNull().default('staff'),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.shopId, table.userId] }),
    index('shop_members_user_idx').on(table.userId),
  ],
);

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type ShopMember = typeof shopMembers.$inferSelect;
export type NewShopMember = typeof shopMembers.$inferInsert;
