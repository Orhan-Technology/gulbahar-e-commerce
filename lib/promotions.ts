import type { PromotionSlotKey } from './db/schema';

/**
 * What each placement slot promotes (PRD §8.2).
 *
 * Three categories, not two, because the home hero is genuinely different: its
 * renderer (homeHeroCampaign in lib/db/queries/home.ts) draws either a product or the
 * shop's own banner, whichever the campaign points at. Treating it as
 * product-required refused a shop that wanted to buy the hero for its brand — a
 * booking the storefront was already built to display.
 *
 * Shared by the booking actions and the slot inventory query, so the picker and the
 * server can never disagree about whether a product is wanted.
 */

/** A product is mandatory: the slot has nowhere to put a shop. */
const PRODUCT_REQUIRED: Set<PromotionSlotKey> = new Set([
  'search_top',
  'category_top',
  'product_related',
]);

/** A product is optional: given one it promotes that, otherwise the shop. */
const PRODUCT_OPTIONAL: Set<PromotionSlotKey> = new Set(['home_hero']);

/** True when the booking cannot proceed without a product. */
export function slotRequiresProduct(key: PromotionSlotKey): boolean {
  return PRODUCT_REQUIRED.has(key);
}

/** True when the picker should be offered at all — required or optional. */
export function slotAcceptsProduct(key: PromotionSlotKey): boolean {
  return PRODUCT_REQUIRED.has(key) || PRODUCT_OPTIONAL.has(key);
}

/** Campaign duration choices offered in the booking sheet (PRD §8.3: flat weekly fee). */
export const CAMPAIGN_WEEK_OPTIONS = [1, 2, 4, 8] as const;
