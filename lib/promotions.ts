import type { PromotionSlotKey } from './db/schema';

/**
 * Which slots promote a PRODUCT rather than the shop itself (PRD §8.2).
 *
 * Shared by the booking action and the slot inventory query: if the two disagreed,
 * the UI would either ask for a product the server ignores or skip the picker for a
 * slot the server then rejects.
 */
const PRODUCT_LEVEL_SLOTS = new Set<PromotionSlotKey>([
  'home_hero',
  'search_top',
  'category_top',
  'product_related',
]);

export function slotNeedsProduct(key: PromotionSlotKey): boolean {
  return PRODUCT_LEVEL_SLOTS.has(key);
}

/** Campaign duration choices offered in the booking sheet (PRD §8.3: flat weekly fee). */
export const CAMPAIGN_WEEK_OPTIONS = [1, 2, 4, 8] as const;
