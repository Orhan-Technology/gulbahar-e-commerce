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
  // Required for a rejection: "we cannot fulfil this" without a reason is what
  // makes a marketplace feel arbitrary.
  reason: z.string().trim().min(3).max(300).optional(),
});

export type AdvanceOrderInput = z.input<typeof inputSchema>;

export async function advanceOrderStatus(
  input: AdvanceOrderInput,
): Promise<OrderActionResult<{ status: OrderStatus }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { orderId, to, reason } = parsed.data;

  if (to === 'rejected' && !reason) return { ok: false, error: 'reason_required' };

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
    note: reason ?? null,
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
      reason: reason ?? '',
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
