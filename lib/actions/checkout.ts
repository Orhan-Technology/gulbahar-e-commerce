'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { clearCart, getCart } from '../cart';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import {
  addresses,
  orderEvents,
  orderItems,
  orders,
  shopMembers,
  users,
  type DbLocale,
} from '../db/schema';
import { deliveryFeeFor } from '../offers';
import { deliveryRates } from '../db/queries/settings';
import { formatCurrency } from '../format';
import { notify, notifyMany, type NotifyParams } from '../notify';

/**
 * Place an order (PRD §5.3, §13.2).
 *
 * ONE order can span shops (PRD §14): the customer has one basket, one payment and
 * one reference. Shop attribution lives on order_items, and each shop is notified
 * about its own lines only, which is also how the shopkeeper's order list scopes
 * itself (PRD §3.1).
 *
 * Everything is written in a single transaction. A half-created order — items
 * without events, or an order the shop never hears about — would be worse than a
 * failed checkout, especially mid-demo.
 */

const schema = z
  .object({
    fulfillment: z.enum(['delivery', 'pickup']),
    paymentMethod: z.enum(['cod', 'hesabpay']),
    addressId: z.string().uuid().optional(),
  })
  .refine((value) => value.fulfillment === 'pickup' || Boolean(value.addressId), {
    message: 'address_required',
  });

export type PlaceOrderResult =
  | { ok: true; reference: string; orderId: string }
  | {
      ok: false;
      error:
        'requires_auth' | 'empty_cart' | 'address_required' | 'invalid_address' | 'invalid_input';
    };

/** Human-readable reference the customer reads back over the phone (PRD §14). */
function buildReference(): string {
  // GC- plus five digits. Collision is retried by the caller loop below.
  return `GC-${Math.floor(10000 + Math.random() * 90000)}`;
}

export async function placeOrder(input: {
  fulfillment: 'delivery' | 'pickup';
  paymentMethod: 'cod' | 'hesabpay';
  addressId?: string;
}): Promise<PlaceOrderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message === 'address_required' ? 'address_required' : 'invalid_input',
    };
  }

  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const cart = await getCart();
  if (cart.groups.length === 0) return { ok: false, error: 'empty_cart' };

  // A delivery address must belong to the person ordering.
  if (parsed.data.fulfillment === 'delivery') {
    const [owned] = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.id, parsed.data.addressId!), eq(addresses.userId, user.id)))
      .limit(1);
    if (!owned) return { ok: false, error: 'invalid_address' };
  }

  const discountTotal = cart.offerSavings;
  // The rates the admin set, not the constants — what the cart quoted and
  // what the order is charged have to come from the same row (A4).
  const deliveryFee = deliveryFeeFor(cart.total, parsed.data.fulfillment, await deliveryRates());
  const total = cart.total + deliveryFee;

  const created = await db.transaction(async (tx) => {
    // Retry on the (vanishingly unlikely) reference collision rather than failing.
    let order: typeof orders.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !order; attempt += 1) {
      try {
        [order] = await tx
          .insert(orders)
          .values({
            reference: buildReference(),
            userId: user.id,
            status: 'placed',
            fulfillment: parsed.data.fulfillment,
            paymentMethod: parsed.data.paymentMethod,
            addressId: parsed.data.fulfillment === 'delivery' ? parsed.data.addressId! : null,
            subtotal: cart.subtotal,
            discountTotal,
            deliveryFee,
            total,
          })
          .returning();
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    if (!order) throw new Error('could not allocate an order reference');

    await tx.insert(orderItems).values(
      cart.groups.flatMap((group) =>
        group.lines.map((line) => ({
          orderId: order!.id,
          shopId: group.shopId,
          productId: line.productId,
          // Snapshotted, so a later price or title change never rewrites history.
          titleSnapshot: line.title,
          priceSnapshot: line.unitPrice,
          quantity: line.quantity,
          variantSelection: line.variantSelection ?? null,
        })),
      ),
    );

    // The append-only chain starts here and drives the tracking timeline.
    await tx.insert(orderEvents).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: 'placed',
      actorUserId: user.id,
    });

    return order;
  });

  /*
   * Notifications go out AFTER the transaction commits. Inside it, a failed
   * insert into notifications would roll back a perfectly good order.
   */
  const [customer] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const customerLocale = (customer?.locale ?? 'fa') as DbLocale;

  await notify({
    eventKey: 'order.placed',
    recipientUserId: user.id,
    recipientRole: 'customer',
    channel: 'sms',
    locale: customerLocale,
    values: {
      reference: created.reference,
      total: formatCurrency(total, customerLocale),
    },
  });

  // One message per shop, carrying only that shop's lines (PRD §3.1).
  const shopMessages: NotifyParams[] = [];
  for (const group of cart.groups) {
    const [owner] = await db
      .select({ userId: shopMembers.userId, locale: users.locale })
      .from(shopMembers)
      .innerJoin(users, eq(shopMembers.userId, users.id))
      .where(and(eq(shopMembers.shopId, group.shopId), eq(shopMembers.role, 'owner')))
      .limit(1);

    const shopLocale = (owner?.locale ?? 'fa') as DbLocale;
    const itemCount = group.lines.reduce((sum, line) => sum + line.quantity, 0);

    shopMessages.push({
      eventKey: 'order.newForShop',
      recipientUserId: owner?.userId ?? null,
      recipientRole: 'shopkeeper',
      channel: 'sms',
      locale: shopLocale,
      values: {
        reference: created.reference,
        itemCount,
        total: formatCurrency(group.total, shopLocale),
        shopName: pickLocale(group.shopName, shopLocale),
      },
    });
  }
  await notifyMany(shopMessages);

  await clearCart();

  revalidatePath('/cart');
  revalidatePath('/account/orders');

  return { ok: true, reference: created.reference, orderId: created.id };
}
