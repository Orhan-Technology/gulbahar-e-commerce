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
 * What a shopkeeper may choose when CANCELLING an order they already accepted.
 *
 * A different list from rejection, because the situations are different: a
 * price error is caught at the door and is a reason to refuse, never a reason
 * to cancel something the customer has been promised. `customer_request` only
 * exists here — a customer cannot ask to cancel an order the shop has not yet
 * accepted, because at that point they can cancel it themselves.
 *
 * Every code needs a string under BOTH `shopOrders.rejectReasons` (the sentence
 * the CUSTOMER reads, in their own language) and the picker's namespace.
 */
export const ORDER_CANCEL_REASONS = [
  'out_of_stock',
  'cannot_fulfil',
  'customer_unreachable',
  'customer_request',
] as const;

/**
 * Reasons the SYSTEM writes, which a shopkeeper must never be offered.
 *
 * `hold_expired` is a reserve-and-collect hold nobody came for (Prompt C11).
 * Putting it in the shopkeeper's list — which is what I did first — offered
 * "Reservation not collected" as a reason for rejecting a fresh order, and
 * crashed the reject dialog on every render because the picker's own namespace
 * had no string for it. It still belongs in the union: the action validates
 * against it, the event note carries it, and C9's health report counts it, so
 * an omission here would quietly understate a shop's rejection rate.
 *
 * `customer_cancelled` is written by lib/actions/orders.ts when the customer
 * ends their own order. It is in the union for the same reason — the timeline
 * and the health report both parse the `reason:` prefix — and out of the
 * shopkeeper's list because it is not a decision they get to make.
 */
export const SYSTEM_REJECT_REASONS = ['hold_expired', 'customer_cancelled'] as const;

/**
 * The validation surface: every code any path may write.
 *
 * Spelled out rather than spread from the three lists above, because they
 * overlap — `out_of_stock` is both a rejection and a cancellation reason — and
 * a spread would put duplicate literals into the zod enum the action validates
 * with.
 */
export const ALL_REJECT_REASONS = [
  'out_of_stock',
  'cannot_fulfil',
  'customer_unreachable',
  'price_error',
  'customer_request',
  'hold_expired',
  'customer_cancelled',
] as const;

export type OrderRejectReason = (typeof ALL_REJECT_REASONS)[number];

export function isOrderRejectReason(value: string | undefined): value is OrderRejectReason {
  return ALL_REJECT_REASONS.includes(value as OrderRejectReason);
}

/**
 * Splits an order_events note back into its code and the free text beside it.
 *
 * The note is written as `reason:<code> — <words>` (lib/actions/shop-orders.ts),
 * a stable prefix rather than a second column on an append-only table. Every
 * screen that shows history has to undo that, or the customer reads
 * `reason:out_of_stock` — which is what the tracking page did until cancellation
 * made it too visible to leave.
 *
 * Returns a null code for a note that carries no reason at all, which is most
 * of them.
 */
export function parseReasonNote(note: string | null | undefined): {
  code: OrderRejectReason | null;
  text: string | null;
} {
  if (!note) return { code: null, text: null };

  // `[\s\S]` rather than the `s` flag: the compile target predates it, and a
  // shopkeeper's note can contain a newline.
  const match = /^reason:([a-z_]+)\s*(?:—\s*([\s\S]*))?$/.exec(note.trim());
  if (!match) return { code: null, text: note };

  const code = match[1];
  return {
    code: isOrderRejectReason(code) ? code : null,
    text: match[2]?.trim() || null,
  };
}
