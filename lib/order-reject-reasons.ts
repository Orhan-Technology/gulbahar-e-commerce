/**
 * Why an order was turned away (Prompt C6).
 *
 * An ENUMERATED list rather than free text alone, for three reasons that all
 * matter downstream:
 *
 * 1. The customer gets an honest, translated sentence instead of whatever the
 *    shopkeeper typed at speed — "out of stock" reads very differently from
 *    "نداریم".
 * 2. C9's shop-health view counts rejection REASONS. "High rejection rate" is
 *    not actionable; "half of them are out of stock" is a stock problem and
 *    "half are unreachable customers" is a delivery problem.
 * 3. It is faster. A required free-text box on a rejection is a tax the
 *    shopkeeper pays fifty times a month, and taxes get avoided.
 *
 * The free-text note survives ALONGSIDE it, optional, for the case the list
 * does not cover — dropping it would make the enumeration a straitjacket.
 *
 * No `'use client'`: the picker is a client component and the action validates
 * against the same list on the server (CLAUDE.md).
 */

/**
 * What a SHOPKEEPER may choose when turning an order away.
 *
 * This is the list the picker maps over, so anything added here appears as a
 * button on the reject dialog and needs a string under BOTH
 * `shopOrders.rejectReasons` and `shopOrders.actions.rejectReasons`.
 */
export const ORDER_REJECT_REASONS = [
  'out_of_stock',
  'cannot_fulfil',
  'customer_unreachable',
  'price_error',
] as const;

/**
 * Reasons the SYSTEM writes, which a shopkeeper must never be offered.
 *
 * `hold_expired` is a reserve-and-collect hold nobody came for (Prompt C11).
 * Putting it in the list above — which is what I did first — offered "Reservation
 * not collected" as a reason for rejecting a fresh order, and crashed the reject
 * dialog on every render because the picker's own namespace had no string for
 * it. It still belongs in the union: the action validates against it, the event
 * note carries it, and C9's health report counts it, so an omission here would
 * quietly understate a shop's rejection rate.
 */
export const SYSTEM_REJECT_REASONS = ['hold_expired'] as const;

export const ALL_REJECT_REASONS = [
  ...ORDER_REJECT_REASONS,
  ...SYSTEM_REJECT_REASONS,
] as const;

export type OrderRejectReason = (typeof ALL_REJECT_REASONS)[number];

export function isOrderRejectReason(value: string | undefined): value is OrderRejectReason {
  return ALL_REJECT_REASONS.includes(value as OrderRejectReason);
}
