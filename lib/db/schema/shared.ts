import { pgEnum, timestamp } from 'drizzle-orm/pg-core';

/**
 * Per-locale content fields are stored as JSONB keyed by locale (PRD §11).
 * Only the primary language (fa) is required; a fallback chain fills the rest,
 * so `en` and `ps` are optional everywhere.
 */
export type LocalizedText = {
  fa: string;
  en?: string | null;
  ps?: string | null;
};

/** All timestamps are UTC (CLAUDE.md). */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull();

export const timestampCol = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/* ---------------------------------------------------------------------------
 * Enums (PRD §14). Declared centrally so the same type is reused by tables and
 * by the Zod schemas that validate server-action input.
 * ------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum('user_role', ['customer', 'shopkeeper', 'admin']);

/** Shop lifecycle: pending → approved → suspended → closed (PRD §7.1). */
export const shopStatusEnum = pgEnum('shop_status', ['pending', 'approved', 'suspended', 'closed']);

export const shopMemberRoleEnum = pgEnum('shop_member_role', ['owner', 'staff']);

export const productStatusEnum = pgEnum('product_status', ['draft', 'published', 'unpublished']);

/**
 * placed → accepted → ready → fulfilled; rejected is terminal from placed
 * (CLAUDE.md, PRD §13.2).
 */
export const orderStatusEnum = pgEnum('order_status', [
  'placed',
  'accepted',
  'ready',
  'fulfilled',
  'rejected',
]);

export const fulfillmentEnum = pgEnum('fulfillment_method', ['delivery', 'pickup']);

export const paymentMethodEnum = pgEnum('payment_method', ['cod', 'hesabpay']);

export const reviewStatusEnum = pgEnum('review_status', ['visible', 'reported', 'removed']);

export const offerTypeEnum = pgEnum('offer_type', ['percent', 'fixed']);

export const offerScopeEnum = pgEnum('offer_scope', ['shop', 'products']);

/** Paid placement inventory (PRD §8.2). */
export const promotionSlotKeyEnum = pgEnum('promotion_slot_key', [
  'home_hero',
  'featured_shops',
  'search_top',
  'category_top',
  'product_related',
  'directory_top',
]);

/** Campaign lifecycle: requested → approved → active → ended (PRD §13.3). */
export const campaignStatusEnum = pgEnum('campaign_status', [
  'requested',
  'approved',
  'rejected',
  'active',
  'ended',
]);

export const notificationChannelEnum = pgEnum('notification_channel', ['sms', 'inapp']);

export const localeEnum = pgEnum('locale', ['fa', 'en', 'ps']);

/* ---------------------------------------------------------------------------
 * Union types derived from the enums, so application code and Zod schemas stay
 * in lockstep with the database rather than re-declaring the same string lists.
 * ------------------------------------------------------------------------- */

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type ShopStatus = (typeof shopStatusEnum.enumValues)[number];
export type ShopMemberRole = (typeof shopMemberRoleEnum.enumValues)[number];
export type ProductStatus = (typeof productStatusEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type FulfillmentMethod = (typeof fulfillmentEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
export type OfferType = (typeof offerTypeEnum.enumValues)[number];
export type OfferScope = (typeof offerScopeEnum.enumValues)[number];
export type PromotionSlotKey = (typeof promotionSlotKeyEnum.enumValues)[number];
export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];
export type NotificationChannel = (typeof notificationChannelEnum.enumValues)[number];
export type DbLocale = (typeof localeEnum.enumValues)[number];
