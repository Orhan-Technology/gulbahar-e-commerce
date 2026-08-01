'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { orderEvents, orderItems, orders, products, users, type OrderStatus } from '../db/schema';
import { siteSettings } from '../db/queries/settings';
import {
  collectionCodeMatches,
  formatCollectionCode,
  generateCollectionCode,
} from '../collection-code';
import { shopNameFor } from '../db/queries/shop-orders';
import { formatCurrency } from '../format';
import { notify, type NotificationEventKey } from '../notify';
import { ALL_REJECT_REASONS, type OrderRejectReason } from '../order-reject-reasons';
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
  // Accepts the system reasons too — `hold_expired` is written by
  // releaseExpiredHold, not chosen in the dialog.
  reasonCode: z.enum(ALL_REJECT_REASONS).optional(),
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

  /*
   * RESERVE & COLLECT (Prompt C11). A pickup order marked ready is a parcel
   * physically under the counter, so this is the moment it gets a code the
   * customer can read out and a window after which the shop may put the goods
   * back on the shelf.
   *
   * Read BEFORE the update so the branch is decided from the row rather than
   * from the caller: `to === 'ready'` alone would issue a code for a delivery
   * order, which would then appear on a customer's screen next to an address.
   */
  const [existing] = await db
    .select({ fulfillment: orders.fulfillment, collectionCode: orders.collectionCode })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const issuingHold = to === 'ready' && existing?.fulfillment === 'pickup';
  const settings = issuingHold ? await siteSettings() : null;

  const holdFields = issuingHold
    ? {
        // Kept if it already exists: a second "mark ready" must not change a
        // code the customer has already been sent.
        collectionCode: existing?.collectionCode ?? generateCollectionCode(),
        holdExpiresAt: new Date(Date.now() + (settings?.pickupHoldHours ?? 48) * 3_600_000),
      }
    : {};

  const [updated] = await db
    .update(orders)
    .set({ status: to, ...holdFields })
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
      collectionCode: orders.collectionCode,
      holdExpiresAt: orders.holdExpiresAt,
    });

  if (!updated) return { ok: false, error: 'transition_not_allowed' };

  /*
   * ACCEPTING A PICKUP ORDER TAKES THE GOODS OFF THE SHELF (Prompt C11).
   *
   * That is what "reserve" means, physically: the shopkeeper puts the item
   * under the counter with the customer's name on it, and it is no longer for
   * sale to whoever walks in next. Without this the shop can sell the same last
   * pair of shoes twice and disappoint the person who reserved it — the exact
   * failure reserve-and-collect exists to prevent.
   *
   * Only for PICKUP, and only THIS shop's lines. Delivery orders are not
   * reserved anywhere in this build; that is a wider gap than C11 and faking it
   * here would make stock behave differently depending on how someone chose to
   * receive the same product.
   *
   * `releaseExpiredHold` is the exact inverse, and rejecting an accepted pickup
   * order goes through it too.
   */
  if (to === 'accepted' && updated.fulfillment === 'pickup') {
    const lines = await db
      .select({ productId: orderItems.productId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.shopId, context.shopId)));

    for (const line of lines) {
      if (!line.productId) continue;
      await db
        .update(products)
        // Never below zero: a shop that oversold before accepting should end at
        // zero rather than at a negative number the stock report cannot show.
        .set({ stock: sql`greatest(${products.stock} - ${line.quantity}, 0)` })
        .where(eq(products.id, line.productId));
    }
  }

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
      // Empty for delivery, which is what the message template branches on.
      collectionCode: updated.collectionCode ? formatCollectionCode(updated.collectionCode) : '',
      holdHours: settings ? String(settings.pickupHoldHours) : '',
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

/* -------------------------------------------------------------------------- */
/* Reserve & collect (Prompt C11)                                             */

/**
 * The customer arrives, reads out their code, and takes the parcel away.
 *
 * A SEPARATE ACTION from `advanceOrderStatus`, not a flag on it, because the
 * precondition is different in kind: every other transition is the shopkeeper
 * deciding something, and this one is the shopkeeper CONFIRMING something the
 * customer brought with them. Folding it in would mean an optional code
 * parameter that is silently ignored on four of the five transitions.
 *
 * The code is checked SERVER-SIDE against the stored one. It is not a secret —
 * the shopkeeper can already see the order — but a mismatch means the parcel in
 * their hand belongs to somebody else, which is exactly the mistake worth
 * catching at a busy counter.
 */
const collectSchema = z.object({
  orderId: z.string().uuid(),
  code: z.string().trim().min(3).max(12),
});

export async function collectOrder(
  input: z.input<typeof collectSchema>,
): Promise<OrderActionResult<{ reference: string }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = collectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      collectionCode: orders.collectionCode,
      userId: orders.userId,
      total: orders.total,
    })
    .from(orders)
    .where(
      and(
        eq(orders.id, parsed.data.orderId),
        sql`exists (select 1 from order_items oi where oi.order_id = orders.id and oi.shop_id = ${context.shopId})`,
      ),
    )
    .limit(1);

  if (!order) return { ok: false, error: 'not_found' };
  if (order.fulfillment !== 'pickup') return { ok: false, error: 'not_a_pickup' };
  if (order.status !== 'ready') return { ok: false, error: 'not_ready' };
  if (!collectionCodeMatches(order.collectionCode, parsed.data.code)) {
    return { ok: false, error: 'code_mismatch' };
  }

  const [updated] = await db
    .update(orders)
    // The hold is over, so the expiry is cleared: an expired-holds queue that
    // still listed collected orders would be a list of work already done.
    .set({ status: 'fulfilled', holdExpiresAt: null })
    .where(and(eq(orders.id, order.id), eq(orders.status, 'ready')))
    .returning({ id: orders.id });

  if (!updated) return { ok: false, error: 'transition_not_allowed' };

  await db.insert(orderEvents).values({
    orderId: order.id,
    fromStatus: 'ready',
    toStatus: 'fulfilled',
    actorUserId: context.userId,
    note: 'collected',
  });

  const [customer] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);

  const shop = await shopNameFor(context.shopId);
  const locale = customer?.locale ?? 'fa';

  await notify({
    eventKey: 'order.collected',
    recipientUserId: order.userId,
    recipientRole: 'customer',
    locale,
    values: {
      reference: order.reference,
      shopName: shop ? pickLocale(shop.name, locale) : '',
      total: formatCurrency(order.total, locale),
    },
  });

  revalidateOrder(order.id, order.reference);
  return { ok: true, data: { reference: order.reference } };
}

/**
 * Releases an unclaimed hold and puts the goods back on the shelf.
 *
 * THE STOCK MOVEMENT IS THE POINT. A reserve-and-collect order takes the item
 * off the shelf the moment the shop accepts it — that is what "reserve" means,
 * and it is what stops the shop selling the same last pair of shoes twice — so
 * an unclaimed hold has to give it back or the catalogue slowly starves.
 *
 * The order ends REJECTED with an enumerated reason rather than in a new
 * terminal state: the customer did not collect it, the shop is not at fault,
 * and 'rejected' already carries a reason the customer is told about. Inventing
 * an 'expired' status would mean teaching every status filter, chart and
 * notification template about a sixth value for one case.
 *
 * Only after the window has actually passed. A shopkeeper who wants the goods
 * back sooner can reject the order and say why.
 */
export async function releaseExpiredHold(
  orderId: string,
): Promise<OrderActionResult<{ restored: number }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      holdExpiresAt: orders.holdExpiresAt,
      userId: orders.userId,
      total: orders.total,
    })
    .from(orders)
    .where(
      and(
        eq(orders.id, parsed.data),
        sql`exists (select 1 from order_items oi where oi.order_id = orders.id and oi.shop_id = ${context.shopId})`,
      ),
    )
    .limit(1);

  if (!order) return { ok: false, error: 'not_found' };
  if (order.fulfillment !== 'pickup' || order.status !== 'ready') {
    return { ok: false, error: 'not_on_hold' };
  }
  if (!order.holdExpiresAt || order.holdExpiresAt.getTime() > Date.now()) {
    return { ok: false, error: 'not_expired' };
  }

  const restored = await db.transaction(async (tx) => {
    const [moved] = await tx
      .update(orders)
      .set({ status: 'rejected', holdExpiresAt: null, collectionCode: null })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'ready')))
      .returning({ id: orders.id });

    if (!moved) return 0;

    // Only THIS shop's lines: a basket that crossed two shops must not put
    // the other tenant's goods back (PRD §3.1).
    const lines = await tx
      .select({ productId: orderItems.productId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, order.id), eq(orderItems.shopId, context.shopId)));

    let units = 0;
    for (const line of lines) {
      if (!line.productId) continue;
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${line.quantity}` })
        .where(eq(products.id, line.productId));
      units += line.quantity;
    }

    await tx.insert(orderEvents).values({
      orderId: order.id,
      fromStatus: 'ready',
      toStatus: 'rejected',
      actorUserId: context.userId,
      note: 'reason:hold_expired',
    });

    return units;
  });

  if (restored === 0 && order.status !== 'ready') {
    return { ok: false, error: 'transition_not_allowed' };
  }

  const [customer] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);

  const shop = await shopNameFor(context.shopId);
  const locale = customer?.locale ?? 'fa';

  await notify({
    eventKey: 'order.holdExpired',
    recipientUserId: order.userId,
    recipientRole: 'customer',
    locale,
    values: {
      reference: order.reference,
      shopName: shop ? pickLocale(shop.name, locale) : '',
    },
  });

  revalidateOrder(order.id, order.reference);
  revalidatePath('/dashboard/products');
  return { ok: true, data: { restored } };
}

function revalidateOrder(orderId: string, reference: string) {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${reference}`);
}
