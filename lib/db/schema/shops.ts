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
import {
  createdAt,
  shopMemberRoleEnum,
  shopStatusEnum,
  timestampCol,
  type LocalizedText,
} from './shared';
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
    /** One line. This is what a shop CARD shows, so it stays short. */
    description: jsonb('description').$type<LocalizedText>(),
    /**
     * The longer story, for the shop page's About tab (Prompt C8).
     *
     * Separate from `description` rather than replacing it, because the two are
     * read in different places at different lengths: a card in a directory can
     * carry one line, and an About tab that repeats that one line reads as a
     * page with nothing on it.
     */
    story: jsonb('story').$type<LocalizedText>(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    floor: integer('floor'),
    unitNumber: text('unit_number'),
    phone: text('phone'),
    hours: text('hours'),
    /**
     * When mall management last confirmed this is a registered business at this
     * unit (Prompt C7). Denormalised from shop_verifications so the badge on a
     * shop card costs no join — it is read on every listing and every product
     * page, and the verification record itself is read once, by the admin.
     *
     * Null means unverified, which is the NORMAL starting state: approval
     * decides whether a shop may list at all, verification confirms the
     * paperwork, and a shop can be approved and unverified for months.
     */
    verifiedAt: timestampCol('verified_at'),
    /**
     * When this tenant took the unit (Prompt C8) — NOT when they joined the
     * platform, which is what `createdAt` records and which for every seeded
     * shop is a few weeks ago.
     *
     * Stored as a DATE and rendered as a DURATION ("11 years at Gulbahar"),
     * never as a calendar year. A year number would have to be printed in some
     * calendar, and fa readers count in Hijri Shamsi while the column holds
     * Gregorian — an elapsed count of years is the same number in both.
     */
    tenantSince: timestampCol('tenant_since'),
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
