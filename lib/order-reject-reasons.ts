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

export const ORDER_REJECT_REASONS = [
  'out_of_stock',
  'cannot_fulfil',
  'customer_unreachable',
  'price_error',
] as const;

export type OrderRejectReason = (typeof ORDER_REJECT_REASONS)[number];

export function isOrderRejectReason(value: string | undefined): value is OrderRejectReason {
  return ORDER_REJECT_REASONS.includes(value as OrderRejectReason);
}
