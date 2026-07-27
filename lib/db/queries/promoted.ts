import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '..';
import { campaigns, promotionSlots, type PromotionSlotKey } from '../schema';

/**
 * Paid placement lookup (PRD §8.2, §8.4).
 *
 * The guardrails live here rather than in each page, so no listing can
 * accidentally break them:
 *
 *   1. Promoted results are returned as a SEPARATE list with a `promoted` flag.
 *      They are never mixed into the organic query, so paid placement can never
 *      reorder organic results — a shop can buy the top slot, not a better score.
 *   2. The number returned is capped by the slot's own `capacity`, which is what
 *      keeps organic results dominant.
 *   3. Only campaigns that are active AND inside their date window count.
 */
export type PromotedEntry = {
  campaignId: string;
  shopId: string;
  productId: string | null;
};

export async function activeCampaignsForSlot(
  slotKey: PromotionSlotKey,
  now: Date = new Date(),
): Promise<PromotedEntry[]> {
  const rows = await db
    .select({
      campaignId: campaigns.id,
      shopId: campaigns.shopId,
      productId: campaigns.productId,
      capacity: promotionSlots.capacity,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .where(
      and(
        eq(promotionSlots.key, slotKey),
        eq(campaigns.status, 'active'),
        lte(campaigns.startsAt, now),
        gte(campaigns.endsAt, now),
      ),
    )
    // Longest-running first, so renewals keep their position rather than
    // shuffling on every page load.
    .orderBy(campaigns.startsAt);

  const capacity = rows[0]?.capacity ?? 0;
  return rows.slice(0, capacity).map(({ campaignId, shopId, productId }) => ({
    campaignId,
    shopId,
    productId,
  }));
}

/** Product ids promoted in a slot, in slot order. */
export async function promotedProductIds(slotKey: PromotionSlotKey, now?: Date): Promise<string[]> {
  const entries = await activeCampaignsForSlot(slotKey, now);
  return entries.map((entry) => entry.productId).filter((id): id is string => id !== null);
}

/** Shop ids promoted in a slot, in slot order. */
export async function promotedShopIds(slotKey: PromotionSlotKey, now?: Date): Promise<string[]> {
  const entries = await activeCampaignsForSlot(slotKey, now);
  return entries.map((entry) => entry.shopId);
}

/**
 * Records an impression for every campaign rendered. Fire-and-forget: a failed
 * counter update must never break a page render.
 */
export async function recordImpressions(campaignIds: string[]): Promise<void> {
  if (campaignIds.length === 0) return;
  try {
    await db
      .update(campaigns)
      .set({ impressions: sql`${campaigns.impressions} + 1` })
      .where(inArray(campaigns.id, campaignIds));
  } catch {
    // Metrics are seeded for the demo (PRD §15); losing one increment is fine.
  }
}
