'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { orderEvents, orders, users, type OrderStatus } from '../db/schema';
import { shopNameFor } from '../db/queries/shop-orders';
import { formatCurrency } from '../format';
import { notify, type NotificationEventKey } from '../notify';
import { ORDER_REJECT_REASONS, type OrderRejectReason } from '../order-reject-reasons';
import faMessages from '../../messages/fa.json';
import enMessages from '../../messages/en.json';

/**
 * Order transitions driven by the shopkeeper (PRD §6.3, §13.2).
 *
 * Three invariants, all enforced here rather than in the UI:
 *
 *   1. The shop must have a line in the order. Checked in SQL via EXISTS, so a
 *      forged order id finds nothing.
 *   2. The transition must be legal from the CURRENT status, and the update reads
 *      that status in its own WHERE clause. Two shopkeepers tapping "accept" at
 *      once therefore produce one transition and one notification, not two.
 *   3. Every transition appends an order_events row and calls notify(). Status
 *      never moves without both (CLAUDE.md), which is what keeps the customer's
 *      timeline and the notification log truthful.
 *
 * MULTI-SHOP CAVEAT: `orders.status` is order-level (PRD §14), so on the 17% of
 * seeded orders that span two shops either shop's action advances the shared
 * order. The event note records who acted, and the detail screen says so. Per-shop
 * fulfilment status is a phase-2 schema change, not something to fake here.
 */

/** Legal transitions. rejected and fulfilled are terminal. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['accepted', 'rejected'],
  accepted: ['ready'],
  ready: ['fulfilled'],
  fulfilled: [],
  rejected: [],
};

const EVENT_KEYS: Record<string, NotificationEventKey> = {
  accepted: 'order.accepted',
  rejected: 'order.rejected',
  ready: 'order.ready',
  fulfilled: 'order.fulfilled',
};

export type OrderActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId) return null;
  // Admin can unpublish shop content but never acts on a shop's orders (PRD §3.1).
  if (user.role !== 'shopkeeper') return null;
  return { userId: user.id, shopId: user.shopId };
}

const inputSchema = z.object({
  orderId: z.string().uuid(),
  to: z.enum(['accepted', 'rejected', 'ready', 'fulfilled']),
  /*
   * A rejection carries a CODE from the shared list (Prompt C6), and may carry
   * a note as well. The code is what the customer's message is written from —
   * translated into their language rather than the shopkeeper's — and what
   * C9's shop-health view counts. "We cannot fulfil this" with no reason at all
   * is what makes a marketplace feel arbitrary.
   */
  reasonCode: z.enum(ORDER_REJECT_REASONS).optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export type AdvanceOrderInput = z.input<typeof inputSchema>;

/**
 * Advances several orders at once (Prompt C6).
 *
 * REPORTS PARTIAL FAILURE rather than throwing on the first one. A shopkeeper
 * selecting five orders and pressing "accept all" will occasionally hit one
 * another staff member already accepted, and the honest answer is "4 accepted,
 * 1 could not" — not a red toast that leaves them wondering which four went
 * through.
 *
 * Sequential rather than parallel on purpose: each call writes an event and
 * sends a notification, and five concurrent transactions against the same rows
 * is a deadlock waiting for a busy Friday. Five orders is not a batch job.
 */
export async function bulkAdvanceOrders(
  orderIds: string[],
  to: 'accepted' | 'ready',
): Promise<OrderActionResult<{ done: string[]; failed: string[] }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.array(z.string().uuid()).min(1).max(50).safeParse(orderIds);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const done: string[] = [];
  const failed: string[] = [];

  for (const orderId of parsed.data) {
    const result = await advanceOrderStatus({ orderId, to });
    if (result.ok) done.push(orderId);
    else failed.push(orderId);
  }

  return { ok: true, data: { done, failed } };
}

/**
 * The enumerated reason, in the reader's language.
 *
 * Resolved through the same message tree the UI uses, so the sentence a
 * customer receives is the sentence the shopkeeper picked — not a second
 * translation that drifts.
 */
function rejectReasonText(code: OrderRejectReason, locale: string): string {
  const messages = locale === 'en' ? enMessages : faMessages;
  const table = (messages as unknown as {
    shopOrders: { rejectReasons: Record<string, string> };
  }).shopOrders.rejectReasons;
  return table[code] ?? code;
}

export async function advanceOrderStatus(
  input: AdvanceOrderInput,
): Promise<OrderActionResult<{ status: OrderStatus }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { orderId, to, reasonCode, reason } = parsed.data;

  if (to === 'rejected' && !reasonCode) return { ok: false, error: 'reason_required' };

  // Which statuses may legally become `to` — the inverse of TRANSITIONS.
  const allowedFrom = (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) =>
    TRANSITIONS[from].includes(to),
  );

  const [updated] = await db
    .update(orders)
    .set({ status: to })
    .where(
      and(
        eq(orders.id, orderId),
        // The current status is part of the predicate, so an illegal or repeated
        // transition updates zero rows instead of racing.
        inArray(orders.status, allowedFrom),
        sql`exists (select 1 from order_items oi where oi.order_id = orders.id and oi.shop_id = ${context.shopId})`,
      ),
    )
    .returning({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      userId: orders.userId,
      total: orders.total,
    });

  if (!updated) return { ok: false, error: 'transition_not_allowed' };

  const shop = await shopNameFor(context.shopId);

  await db.insert(orderEvents).values({
    orderId,
    // The event chain records where it came from, which is why allowedFrom is
    // reconstructed rather than re-read: the row is already updated by now.
    fromStatus: allowedFrom.length === 1 ? allowedFrom[0] : null,
    toStatus: to,
    actorUserId: context.userId,
    /*
     * The code first, then the note. Stored as one string because order_events
     * has one note column and the code is a stable prefix — `reason:code` —
     * which the customer's timeline and the health report can both parse
     * without a migration on a table that is append-only by design.
     */
    note: reasonCode ? [`reason:${reasonCode}`, reason].filter(Boolean).join(' — ') : (reason ?? null),
  });

  // The SMS is written in the CUSTOMER's language, not the shopkeeper's.
  const [customer] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, updated.userId))
    .limit(1);

  const locale = customer?.locale ?? 'fa';

  await notify({
    eventKey: EVENT_KEYS[to],
    recipientUserId: updated.userId,
    recipientRole: 'customer',
    locale,
    values: {
      reference: updated.reference,
      shopName: shop ? pickLocale(shop.name, locale) : '',
      fulfillment: updated.fulfillment,
      total: formatCurrency(updated.total, locale),
      // Translated into the CUSTOMER's language from the code, with the
      // shopkeeper's own words appended when they added any.
      reason: reasonCode
        ? [rejectReasonText(reasonCode, locale), reason].filter(Boolean).join(' — ')
        : (reason ?? ''),
    },
  });

  // The customer's tracking screen and history, the shop's queue, and the
  // dashboard action queue all show this order.
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/account/orders');
  revalidatePath(`/checkout/confirmation/${updated.reference}`);
  revalidatePath(`/account/orders/${updated.reference}`);

  return { ok: true, data: { status: to } };
}
