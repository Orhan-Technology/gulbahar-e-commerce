'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db';
import { pickLocale } from '../db/localized';
import { orderEvents, orderItems, orders, shopMembers, shops, users } from '../db/schema';
import { formatCurrency } from '../format';
import { notify, notifyMany } from '../notify';
import { RESERVING_STATUSES, restoreOrderStock } from '../order-lifecycle';
import { requireAdminContext } from '../admin-context';
import { recordAdminAction } from '../audit';

/**
 * The mall ending an order (PRD §7.4, §13.2).
 *
 * THE ONE LEVER THE CONSOLE WAS MISSING. Everything else admin could do about a
 * stalled order was to NUDGE the shop — a message, and then another message,
 * and no way to ever end it. An order abandoned by its shop sat at `placed`
 * forever with the customer's money notionally committed and the stock off the
 * shelf, and the only exit was a database client.
 *
 * IT IS NOT A FULFILMENT DECISION, which is why it lives here rather than
 * beside the shopkeeper's transitions. Admin still cannot accept, ready or
 * fulfil anything on a tenant's behalf (PRD §3.1); what it can do is declare
 * that a transaction the platform is hosting is over. The order detail screen
 * stays read-only about every other status — this is the single write on it.
 *
 * A REASON IS REQUIRED, at the same ten-character floor as a shop rejection.
 * Two people who did not ask for this are about to be told it happened, and
 * "cancelled by mall management" with nothing after it is how a marketplace
 * teaches its tenants that decisions are arbitrary.
 *
 * STOCK GOES BACK via the SHARED helper, `restoreOrderStock()` from
 * lib/order-lifecycle.ts — the same function the shopkeeper's reject, cancel
 * and hold-expiry paths call, in the same transaction as the status change.
 * There is deliberately no second implementation of the release: the model is
 * that every line is reserved at checkout and returned by whichever path ends
 * the order, and two copies of that rule is how one of them drifts.
 */

export type AdminActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const cancelSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(10, { message: 'reason_too_short' }).max(500),
});

export type AdminCancelOrderInput = z.input<typeof cancelSchema>;

export async function adminCancelOrder(
  input: AdminCancelOrderInput,
): Promise<AdminActionResult<{ reference: string; restoredUnits: number }>> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { ok: false, error: message === 'reason_too_short' ? message : 'invalid_input' };
  }

  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      total: orders.total,
      userId: orders.userId,
    })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);

  if (!order) return { ok: false, error: 'not_found' };
  /*
   * Non-terminal only. `fulfilled` is goods that left the counter and
   * `rejected`/`cancelled` are already over — reopening any of them would put
   * stock back that never came back, which is the one arithmetic error this
   * whole reservation model exists to prevent.
   */
  if (!RESERVING_STATUSES.includes(order.status)) return { ok: false, error: 'not_cancellable' };

  const before = order.status;

  const result = await db.transaction(async (tx) => {
    const [moved] = await tx
      .update(orders)
      // The current status is part of the predicate, so a second press — or a
      // shopkeeper fulfilling it in the same second — updates zero rows rather
      // than racing the restore.
      .set({ status: 'cancelled', holdExpiresAt: null, collectionCode: null })
      .where(and(eq(orders.id, order.id), inArray(orders.status, RESERVING_STATUSES)))
      .returning({ id: orders.id });

    if (!moved) return null;

    const restoredUnits = await restoreOrderStock(tx, order.id);

    await tx.insert(orderEvents).values({
      orderId: order.id,
      fromStatus: before,
      toStatus: 'cancelled',
      actorUserId: context.actorId,
      /*
       * The admin's own words, with NO `reason:<code>` prefix. The enumerated
       * codes in lib/order-reject-reasons.ts are the shopkeeper's list and are
       * counted against a tenant by C9's health report; a mall decision is not
       * the tenant's rejection, and inventing a code for it would either be
       * counted there or fall through parseReasonNote() as an unknown one.
       * Plain text parses back as `{ code: null, text }`, which is exactly what
       * the timeline should show.
       */
      note: parsed.data.reason,
    });

    return { restoredUnits };
  });

  if (!result) return { ok: false, error: 'not_cancellable' };

  /* ---------------------------------------------------------------------- */
  /* Both sides are told, each in their OWN language                        */

  const [customer] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);

  const customerLocale = customer?.locale ?? 'fa';

  // Every shop with a line on this order, not just the first. An order-level
  // status (PRD §14) ends every tenant's lines at once, and the tenant whose
  // parcel is already wrapped is precisely the one who must not find out later.
  const affectedShops = await db
    .selectDistinct({ id: shops.id, name: shops.name })
    .from(orderItems)
    .innerJoin(shops, eq(shops.id, orderItems.shopId))
    .where(eq(orderItems.orderId, order.id));

  await notify({
    eventKey: 'order.cancelledByMall',
    recipientUserId: order.userId,
    recipientRole: 'customer',
    locale: customerLocale,
    values: {
      reference: order.reference,
      reason: parsed.data.reason,
      total: formatCurrency(order.total, customerLocale),
    },
  });

  const shopIds = affectedShops.map((shop) => shop.id);
  const members = shopIds.length
    ? await db
        .select({ userId: shopMembers.userId, locale: users.locale, shopId: shopMembers.shopId })
        .from(shopMembers)
        .innerJoin(users, eq(users.id, shopMembers.userId))
        .where(inArray(shopMembers.shopId, shopIds))
    : [];

  await notifyMany(
    members.map((member) => {
      const shop = affectedShops.find((row) => row.id === member.shopId);
      return {
        eventKey: 'order.cancelledByMallForShop' as const,
        channel: 'inapp' as const,
        recipientUserId: member.userId,
        recipientRole: 'shopkeeper' as const,
        // Never 'fa': the recipient reads this, not the admin who wrote it.
        locale: member.locale,
        values: {
          reference: order.reference,
          reason: parsed.data.reason,
          shopName: shop ? pickLocale(shop.name, member.locale) : '',
        },
      };
    }),
  );

  await recordAdminAction({
    ...context,
    action: 'order.cancel',
    targetType: 'order',
    targetId: order.id,
    targetLabel: order.reference,
    reason: parsed.data.reason,
    detail: {
      from: before,
      to: 'cancelled',
      restoredUnits: result.restoredUnits,
      shops: affectedShops.length,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/orders');
  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${order.reference}`);
  // Units are back on the shelf, so the catalogue changed too.
  revalidatePath('/products');
  revalidatePath('/dashboard/products');

  return { ok: true, data: { reference: order.reference, restoredUnits: result.restoredUnits } };
}
