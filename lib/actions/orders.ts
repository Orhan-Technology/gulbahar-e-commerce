'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
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
  type DbLocale,
} from '../db/schema';
import { CUSTOMER_CANCELLABLE, orderReasonText, restoreOrderStock } from '../order-lifecycle';
import { notify, notifyMany, type NotifyParams } from '../notify';

/**
 * The CUSTOMER's own end of the order lifecycle (PRD §13.2).
 *
 * The shopkeeper's transitions live in lib/actions/shop-orders.ts, scoped by an
 * EXISTS on their order lines; the mall's live in lib/actions/admin-orders.ts.
 * All three share the same two invariants, which is why the stock helper lives
 * in lib/order-lifecycle.ts rather than in any one of them: the status change
 * and the stock release happen in ONE transaction, and the person affected is
 * told in THEIR language.
 *
 * A customer may pull out only while the order is still `placed`. Once a shop
 * has accepted, somebody has started picking stock and setting a parcel aside,
 * and walking away from that silently is how a marketplace teaches its tenants
 * to distrust it. After that point the customer rings the shop and the shop
 * cancels with `customer_request` — which is why that code exists.
 */

const cancelSchema = z.object({ orderId: z.string().uuid() });

export type CancelOrderResult =
  | { ok: true; reference: string }
  | { ok: false; error: 'requires_auth' | 'invalid_input' | 'not_found' | 'too_late' };

/**
 * OWNER-SCOPED IN THE WHERE CLAUSE, not in a preceding read: the user id and
 * the legal statuses are both part of the predicate, so somebody else's order
 * id updates zero rows rather than relying on a check a later edit could forget
 * to keep.
 */
export async function cancelOrder(input: { orderId: string }): Promise<CancelOrderResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const { orderId } = parsed.data;

  const ended = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      // A hold, if the order somehow has one, ends with the order.
      .set({ status: 'cancelled', holdExpiresAt: null, collectionCode: null })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.userId, user.id),
          inArray(orders.status, CUSTOMER_CANCELLABLE),
        ),
      )
      .returning({ id: orders.id, reference: orders.reference });

    if (!row) return null;

    /*
     * The goods go back on the shelf, in the same transaction. Matching only
     * once is what makes this idempotent: a second press updates no row,
     * restores nothing and appends no event.
     */
    await restoreOrderStock(tx, row.id);

    await tx.insert(orderEvents).values({
      orderId: row.id,
      fromStatus: 'placed',
      toStatus: 'cancelled',
      actorUserId: user.id,
      // The `reason:<code>` prefix the timeline and the health report parse.
      note: 'reason:customer_cancelled',
    });

    return row;
  });

  if (!ended) {
    /*
     * Two answers, because they need two different sentences: an order that
     * exists but has moved on is "too late, ring the shop", and one that does
     * not resolve at all is simply not found.
     */
    const [exists] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)))
      .limit(1);
    return { ok: false, error: exists ? 'too_late' : 'not_found' };
  }

  /*
   * Messaging is outside the transaction: a failed notification insert must not
   * roll back a cancellation that has already put stock back on the shelf.
   */
  const [customer] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  // THE CUSTOMER'S OWN LANGUAGE, never a hardcoded 'fa'.
  const customerLocale = (customer?.locale ?? 'fa') as DbLocale;

  await notify({
    eventKey: 'order.cancelled',
    recipientUserId: user.id,
    recipientRole: 'customer',
    locale: customerLocale,
    values: {
      reference: ended.reference,
      reason: orderReasonText('customer_cancelled', customerLocale),
    },
  });

  /*
   * EVERY shop in the basket hears about it, each in its owner's language. A
   * shopkeeper who has already started pulling stock for an order the customer
   * withdrew needs to know before they walk to the shelf, and a queue row
   * disappearing without a word is what makes a console feel unreliable.
   */
  const owners = await db
    .selectDistinct({ userId: shopMembers.userId, locale: users.locale, shopName: shops.name })
    .from(orderItems)
    .innerJoin(shops, eq(orderItems.shopId, shops.id))
    .innerJoin(shopMembers, and(eq(shopMembers.shopId, shops.id), eq(shopMembers.role, 'owner')))
    .innerJoin(users, eq(shopMembers.userId, users.id))
    .where(eq(orderItems.orderId, ended.id));

  const messages: NotifyParams[] = owners.map((owner) => {
    const locale = (owner.locale ?? 'fa') as DbLocale;
    return {
      eventKey: 'order.cancelledForShop',
      recipientUserId: owner.userId,
      recipientRole: 'shopkeeper',
      locale,
      values: {
        reference: ended.reference,
        shopName: pickLocale(owner.shopName, locale),
        reason: orderReasonText('customer_cancelled', locale),
      },
    };
  });
  await notifyMany(messages);

  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${ended.reference}`);
  revalidatePath(`/checkout/confirmation/${ended.reference}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${ended.id}`);
  // The units are back in the catalogue.
  revalidatePath('/dashboard/products');
  revalidatePath('/products');

  return { ok: true, reference: ended.reference };
}
