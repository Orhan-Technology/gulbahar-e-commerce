import { eq, sql } from 'drizzle-orm';

import { db } from './db';
import { orderItems, products, type OrderStatus } from './db/schema';
import type { OrderRejectReason } from './order-reject-reasons';
import faMessages from '../messages/fa.json';
import enMessages from '../messages/en.json';

/**
 * The stock half of the order lifecycle, shared by every path that ENDS an
 * order without the goods leaving the shop.
 *
 * Not in a `'use server'` module on purpose: these are helpers called by server
 * actions, and every export of a `'use server'` file becomes a callable
 * endpoint (CLAUDE.md). Nothing here should be reachable from a browser.
 */

/** A transaction handle — every caller runs inside one, and must. */
export type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Statuses in which the goods are still reserved against the catalogue.
 *
 * `fulfilled` is not here because the customer walked away with the items, and
 * `rejected`/`cancelled` are not because reaching them is what gives them back.
 */
export const RESERVING_STATUSES: OrderStatus[] = ['placed', 'accepted', 'ready'];

/** The customer may still pull out while nobody has committed anything. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['placed'];

/**
 * Puts an ended order's units back on the shelf.
 *
 * EXACTLY THE ORDERED QUANTITY, from order_items — never a recomputed figure
 * and never a clamp. `greatest(stock - qty, 0)` on the way out would silently
 * turn a two-unit reservation into a one-unit return; the products CHECK
 * constraint (stock >= 0) is what protects the column now, and the conditional
 * decrement at placement is what makes it impossible to go negative in the
 * first place (lib/actions/checkout.ts).
 *
 * EVERY line, not just one shop's. Under the reservation model the whole basket
 * is decremented at placement, and `orders.status` is order-level (PRD §14), so
 * an order reaching a terminal state ends every shop's lines at once. Restoring
 * only the acting shop's would quietly starve the other tenant's catalogue —
 * the opposite of the PRD §3.1 concern, which is about a shop READING or
 * EDITING another's content, not about returning stock the platform reserved.
 *
 * Must run inside the same transaction as the status change, so a failure
 * cannot leave an ended order holding stock.
 */
export async function restoreOrderStock(tx: OrderTx, orderId: string): Promise<number> {
  const lines = await tx
    .select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  let units = 0;
  for (const line of lines) {
    // Null once the product row is gone (ON DELETE SET NULL): there is nothing
    // left to restore it to.
    if (!line.productId) continue;
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${line.quantity}` })
      .where(eq(products.id, line.productId));
    units += line.quantity;
  }

  return units;
}

/**
 * The enumerated reason, in the READER's language.
 *
 * Resolved through the same message tree the UI uses, so the sentence a
 * customer receives is the sentence the shopkeeper picked rather than a second
 * translation that drifts. Lives here rather than beside the code list because
 * the reject dialog is a client component and importing both message files into
 * a module it depends on would ship the whole tree twice.
 */
export function orderReasonText(code: OrderRejectReason, locale: string): string {
  const messages = locale === 'en' ? enMessages : faMessages;
  const table = (
    messages as unknown as { shopOrders: { rejectReasons: Record<string, string> } }
  ).shopOrders.rejectReasons;
  return table[code] ?? code;
}

/**
 * A unique violation on a named constraint.
 *
 * Drizzle wraps driver errors in DrizzleQueryError, whose own `code` is
 * undefined — the PostgresError carrying the SQLSTATE is at `.cause`
 * (CLAUDE.md). Checking `error.code` makes the catch dead code and the action
 * 500s instead of recovering.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint_name?: string } })?.cause;
  const code = cause?.code ?? (error as { code?: string })?.code;
  if (code !== '23505') return false;
  if (!constraint) return true;
  const name = cause?.constraint_name ?? (error as { constraint_name?: string })?.constraint_name;
  // postgres.js exposes the constraint name; when it does not, a 23505 on this
  // insert can only have come from one of the two unique indexes, and the
  // caller's fallback lookup decides which.
  return name === undefined || name === constraint;
}
