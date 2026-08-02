'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import {
  orderEvents,
  orderItems,
  orders,
  shopMembers,
  shops,
  users,
  type OrderStatus,
} from '../db/schema';
import { siteSettings } from '../db/queries/settings';
import {
  collectionCodeMatches,
  formatCollectionCode,
  generateCollectionCode,
} from '../collection-code';
import { shopNameFor } from '../db/queries/shop-orders';
import { formatCurrency } from '../format';
import { notify, notifyMany, type NotificationEventKey } from '../notify';
import { orderReasonText, restoreOrderStock } from '../order-lifecycle';
import { ALL_REJECT_REASONS } from '../order-reject-reasons';

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
 *
 * STOCK IS NOT TOUCHED ON THE WAY FORWARD. Every line of every order — delivery
 * and pickup alike — is reserved when the order is PLACED, by a conditional
 * decrement inside the checkout transaction (lib/actions/checkout.ts). Accepting
 * a pickup order used to be where the goods came off the shelf, which meant a
 * delivery customer's units were never reserved at all and the same last item
 * could be promised twice.
 *
 * So the only stock movement left here is the way BACK: rejection, cancellation
 * and an uncollected hold each return exactly the ordered quantity, in the same
 * transaction as the status change, via restoreOrderStock().
 */

/**
 * Legal transitions. fulfilled, rejected and cancelled are terminal.
 *
 * `rejected` and `cancelled` are not synonyms and must not be collapsed:
 * rejected is the SHOP refusing at the door, only from `placed`, and it is the
 * one the shop-health report counts against a tenant. `cancelled` is an
 * accepted order being ended afterwards — by the shop that can no longer
 * fulfil it, by the customer before the shop commits, or by the mall.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['accepted', 'rejected', 'cancelled'],
  accepted: ['ready', 'cancelled'],
  ready: ['fulfilled', 'cancelled'],
  fulfilled: [],
  rejected: [],
  cancelled: [],
};

/** Transitions that end an order with the goods still in the shop. */
const RELEASES_STOCK: OrderStatus[] = ['rejected', 'cancelled'];

const EVENT_KEYS: Record<string, NotificationEventKey> = {
  accepted: 'order.accepted',
  rejected: 'order.rejected',
  ready: 'order.ready',
  fulfilled: 'order.fulfilled',
  cancelled: 'order.cancelled',
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
  to: z.enum(['accepted', 'rejected', 'ready', 'fulfilled', 'cancelled']),
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

export async function advanceOrderStatus(
  input: AdvanceOrderInput,
): Promise<OrderActionResult<{ status: OrderStatus }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { orderId, to, reasonCode, reason } = parsed.data;

  /*
   * A reason is required for BOTH terminal refusals. Cancelling an order the
   * shop already accepted is the worse of the two for the customer — they were
   * told it was coming — so "no reason given" is even less defensible there.
   */
  if (RELEASES_STOCK.includes(to) && !reasonCode) return { ok: false, error: 'reason_required' };

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

  /*
   * The status change, the stock release and the event row are ONE transaction.
   * An order that reached `cancelled` while its units stayed reserved is the
   * failure this whole model exists to prevent, and a terminal status with no
   * event row would leave the customer's timeline lying about it.
   */
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
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

    if (!row) return null;

    /*
     * THE GOODS GO BACK ON THE SHELF. Reaching this line means the WHERE clause
     * above matched, and it can only match once — so the restore happens
     * exactly once however many times the button is pressed.
     */
    if (RELEASES_STOCK.includes(to)) await restoreOrderStock(tx, orderId);

    await tx.insert(orderEvents).values({
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
      note: reasonCode
        ? [`reason:${reasonCode}`, reason].filter(Boolean).join(' — ')
        : (reason ?? null),
    });

    return row;
  });

  if (!updated) return { ok: false, error: 'transition_not_allowed' };

  const shop = await shopNameFor(context.shopId);

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
        ? [orderReasonText(reasonCode, locale), reason].filter(Boolean).join(' — ')
        : (reason ?? ''),
      // Empty for delivery, which is what the message template branches on.
      collectionCode: updated.collectionCode ? formatCollectionCode(updated.collectionCode) : '',
      holdHours: settings ? String(settings.pickupHoldHours) : '',
    },
  });

  /*
   * THE OTHER TENANTS IN THE BASKET, when this ends the order.
   *
   * `orders.status` is order-level (PRD §14), so one shop refusing or
   * cancelling ends every shop's lines and hands back every shop's stock. The
   * other shop finds the row gone from its queue; without this it never learns
   * why, and may already be holding a parcel for it.
   */
  if (RELEASES_STOCK.includes(to)) {
    const others = await db
      .selectDistinct({ userId: shopMembers.userId, locale: users.locale, shopName: shops.name })
      .from(orderItems)
      .innerJoin(shops, eq(orderItems.shopId, shops.id))
      .innerJoin(shopMembers, and(eq(shopMembers.shopId, shops.id), eq(shopMembers.role, 'owner')))
      .innerJoin(users, eq(shopMembers.userId, users.id))
      .where(and(eq(orderItems.orderId, orderId), ne(orderItems.shopId, context.shopId)));

    await notifyMany(
      others.map((owner) => {
        const ownerLocale = owner.locale ?? 'fa';
        return {
          eventKey: 'order.cancelledForShop' as const,
          recipientUserId: owner.userId,
          recipientRole: 'shopkeeper' as const,
          locale: ownerLocale,
          values: {
            reference: updated.reference,
            shopName: pickLocale(owner.shopName, ownerLocale),
            reason: reasonCode ? orderReasonText(reasonCode, ownerLocale) : '',
          },
        };
      }),
    );
  }

  // The customer's tracking screen and history, the shop's queue, and the
  // dashboard action queue all show this order.
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/account/orders');
  revalidatePath(`/checkout/confirmation/${updated.reference}`);
  revalidatePath(`/account/orders/${updated.reference}`);
  // A release put units back, so the catalogue and the stock report changed too.
  if (RELEASES_STOCK.includes(to)) {
    revalidatePath('/dashboard/products');
    revalidatePath('/products');
  }

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
 * THE STOCK MOVEMENT IS THE POINT. The units left the catalogue when the order
 * was placed (lib/actions/checkout.ts), and a parcel nobody came for has to
 * give them back or the catalogue slowly starves.
 *
 * The order ends CANCELLED with an enumerated reason: nobody refused anything —
 * the shop was ready and the customer did not arrive — so counting it as a
 * rejection would overstate the tenant's rejection rate in C9's health report
 * for something that is not their doing. It used to end `rejected` because
 * cancelled did not exist yet.
 *
 * EXACTLY ONCE, and the guard is the `status = 'ready'` predicate on the update
 * rather than a flag: a second release finds no row and restores nothing. Under
 * the old model accept-then-release was decrement-then-restore; now it is
 * restore-only, which is why nothing here double-counts.
 *
 * Only after the window has actually passed. A shopkeeper who wants the goods
 * back sooner can cancel the order and say why.
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
      .set({ status: 'cancelled', holdExpiresAt: null, collectionCode: null })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'ready')))
      .returning({ id: orders.id });

    if (!moved) return 0;

    /*
     * EVERY line, not only this shop's. The whole order is over — status is
     * order-level (PRD §14) — and every line of it was reserved at placement,
     * so restoring a subset would leave the other tenant's units promised to an
     * order that no longer exists.
     */
    await restoreOrderStock(tx, order.id);

    // What the shopkeeper is told, though: the units THEY are putting back on
    // THEIR shelf. Another shop's count would be a number they cannot check.
    const [own] = await tx
      .select({ units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, order.id), eq(orderItems.shopId, context.shopId)));

    await tx.insert(orderEvents).values({
      orderId: order.id,
      fromStatus: 'ready',
      toStatus: 'cancelled',
      actorUserId: context.userId,
      note: 'reason:hold_expired',
    });

    return Number(own?.units ?? 0);
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
