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

/**
 * `archived` is the shopkeeper's delete. A product that has ever been ordered
 * cannot be removed — order_items reference it and the history has to keep
 * naming what was bought — so "delete" hides it from every surface instead,
 * including the shop's own catalogue list, which is what the shopkeeper
 * actually means by the word.
 */
export const productStatusEnum = pgEnum('product_status', [
  'draft',
  'published',
  'unpublished',
  'archived',
]);

/**
 * placed → accepted → ready → fulfilled; rejected is terminal from placed
 * (CLAUDE.md, PRD §13.2).
 *
 * `cancelled` is the escape hatch the other five statuses did not have: a
 * customer changing their mind before the shop has committed, a shop that
 * accepted and then broke the item, an admin ending an order that has been
 * stalled for a week. It is distinct from `rejected` on purpose — rejected is
 * the shop refusing at the door and carries a reason from the shop's fixed
 * list, while cancelled can be initiated by any of the three parties and
 * records who did it in the event chain.
 */
export const orderStatusEnum = pgEnum('order_status', [
  'placed',
  'accepted',
  'ready',
  'fulfilled',
  'rejected',
  'cancelled',
]);

export const fulfillmentEnum = pgEnum('fulfillment_method', ['delivery', 'pickup']);

export const paymentMethodEnum = pgEnum('payment_method', ['cod', 'hesabpay']);

export const reviewStatusEnum = pgEnum('review_status', ['visible', 'reported', 'removed']);

/**
 * Question lifecycle (Prompt P4): pending → answered, with `hidden` as the
 * admin's moderation outcome. There is no 'reported' state — a question is one
 * sentence and the admin either leaves it or hides it.
 */
export const questionStatusEnum = pgEnum('question_status', ['pending', 'answered', 'hidden']);

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

/**
 * Verification lifecycle (Prompt C7).
 *
 * `none` is absence of a record rather than a row, so it is not in the enum —
 * a shop with no verification row simply has none. The states here are the ones
 * a ROW can be in: submitted by the shop, under review by an admin, decided
 * either way, or lapsed.
 */
export const verificationStatusEnum = pgEnum('verification_status', [
  'submitted',
  'under_review',
  'verified',
  'rejected',
  'expired',
]);

export const verificationDocumentKindEnum = pgEnum('verification_document_kind', [
  'business_licence',
  'owner_id',
  'unit_agreement',
  'other',
]);

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
export type QuestionStatus = (typeof questionStatusEnum.enumValues)[number];
export type OfferType = (typeof offerTypeEnum.enumValues)[number];
export type OfferScope = (typeof offerScopeEnum.enumValues)[number];
export type PromotionSlotKey = (typeof promotionSlotKeyEnum.enumValues)[number];
export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];
export type NotificationChannel = (typeof notificationChannelEnum.enumValues)[number];
export type DbLocale = (typeof localeEnum.enumValues)[number];
export type VerificationStatus = (typeof verificationStatusEnum.enumValues)[number];
export type VerificationDocumentKind = (typeof verificationDocumentKindEnum.enumValues)[number];
