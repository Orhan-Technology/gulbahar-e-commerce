import { and, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from './db';
import { offers, shops, type LocalizedText } from './db/schema';

/**
 * Applying shop-funded offers to a cart (PRD §8.1, §5.3).
 *
 * Offers are the shop's own margin, distinct from paid placement, so they carry no
 * Sponsored badge and need no approval. What they do need is a defined arithmetic,
 * because the customer sees the deduction itemised at checkout.
 *
 * RULES, chosen deliberately:
 *   - At most ONE offer applies per shop, the one worth most to the customer.
 *     Stacking two discounts on the same basket is how a demo accidentally sells
 *     something for nothing, and no real shop would offer it.
 *   - `percent` applies to the eligible portion of that shop's subtotal.
 *   - `fixed` is a single deduction off the eligible portion, not per unit — a
 *     500 AFN offer means 500 off the basket, not 500 off every item.
 *   - The deduction can never exceed the eligible portion, so a total can never
 *     go negative.
 */

export type ActiveOffer = {
  id: string;
  shopId: string;
  name: LocalizedText;
  type: 'percent' | 'fixed';
  value: number;
  scope: 'shop' | 'products';
  productIds: string[] | null;
  endsAt: Date;
};

export async function activeOffersForShops(
  shopIds: string[],
  now: Date = new Date(),
): Promise<ActiveOffer[]> {
  if (shopIds.length === 0) return [];

  const rows = await db
    .select({
      id: offers.id,
      shopId: offers.shopId,
      name: offers.name,
      type: offers.type,
      value: offers.value,
      scope: offers.scope,
      productIds: offers.productIds,
      endsAt: offers.endsAt,
    })
    .from(offers)
    .innerJoin(shops, eq(offers.shopId, shops.id))
    .where(
      and(
        inArray(offers.shopId, shopIds),
        eq(offers.active, true),
        lte(offers.startsAt, now),
        gte(offers.endsAt, now),
        eq(shops.status, 'approved'),
      ),
    );

  return rows;
}

export type OfferLine = {
  productId: string;
  /** Line total AFTER any product-level discountPrice. */
  lineTotal: number;
};

export type AppliedOffer = {
  offerId: string;
  name: LocalizedText;
  type: 'percent' | 'fixed';
  value: number;
  /** Integer afghanis taken off this shop's subtotal. */
  amount: number;
};

/**
 * Picks the single best offer for one shop's lines and returns the deduction.
 * Null when no offer applies, so callers can skip the row entirely rather than
 * rendering a zero.
 */
export function bestOfferFor(lines: OfferLine[], shopOffers: ActiveOffer[]): AppliedOffer | null {
  let best: AppliedOffer | null = null;

  for (const offer of shopOffers) {
    const eligible =
      offer.scope === 'shop'
        ? lines
        : lines.filter((line) => (offer.productIds ?? []).includes(line.productId));

    const base = eligible.reduce((total, line) => total + line.lineTotal, 0);
    if (base <= 0) continue;

    const raw = offer.type === 'percent' ? Math.round((base * offer.value) / 100) : offer.value;

    // Never discount more than the eligible portion.
    const amount = Math.min(raw, base);
    if (amount <= 0) continue;

    if (!best || amount > best.amount) {
      best = {
        offerId: offer.id,
        name: offer.name,
        type: offer.type,
        value: offer.value,
        amount,
      };
    }
  }

  return best;
}

/** Kabul delivery fee (PRD §5.3). Free above a threshold, as the seed assumes. */
export const DELIVERY_FEE = 150;
export const FREE_DELIVERY_THRESHOLD = 20000;

export function deliveryFeeFor(subtotalAfterDiscount: number, fulfillment: 'delivery' | 'pickup') {
  if (fulfillment === 'pickup') return 0;
  return subtotalAfterDiscount >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
}
