'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
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
  products,
  shopMembers,
  shops,
  users,
  type DbLocale,
  type LocalizedText,
  type OrderAddressSnapshot,
} from '../db/schema';
import { deliveryFeeFor } from '../offers';
import { deliveryRates } from '../db/queries/settings';
import { formatCurrency, formatNumber } from '../format';
import { isUniqueViolation } from '../order-lifecycle';
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
 *
 * THE INVENTORY MODEL, in one place because it used to be in two:
 *
 *   STOCK IS RESERVED AT PLACEMENT, for every line, however the customer chose
 *   to receive it. The decrement is CONDITIONAL — `where stock >= qty` — so two
 *   customers racing for the last unit produce one order and one honest
 *   "only N left", rather than two orders and a phone call. If any line loses
 *   the race the whole transaction rolls back: a basket is not partially
 *   placeable.
 *
 *   Stock comes BACK when the order ends without the goods leaving: rejection,
 *   cancellation by either side, and an uncollected pickup hold
 *   (lib/actions/shop-orders.ts). Nothing happens at accept or at fulfilment —
 *   the units left the catalogue when the order was placed.
 *
 * Before this, only pickup orders were decremented and only when the shop
 * accepted, so a delivery customer could buy a unit that no longer existed and
 * the same last item could be sold twice while both orders sat unaccepted.
 */

const schema = z
  .object({
    fulfillment: z.enum(['delivery', 'pickup']),
    paymentMethod: z.enum(['cod', 'hesabpay']),
    addressId: z.string().uuid().optional(),
    /**
     * One key per checkout attempt, minted by the form (Prompt: idempotency).
     * Optional so a caller that predates it still works — one is generated here
     * instead, which protects nothing but keeps the unique index satisfied.
     */
    idempotencyKey: z.string().uuid().optional(),
  })
  .refine((value) => value.fulfillment === 'pickup' || Boolean(value.addressId), {
    message: 'address_required',
  });

/** One line the catalogue could not cover, in the words the customer will read. */
export type StockShortage = {
  productId: string;
  title: LocalizedText;
  requested: number;
  available: number;
};

export type PlaceOrderResult =
  | { ok: true; reference: string; orderId: string; duplicate?: true }
  | {
      ok: false;
      error:
        | 'requires_auth'
        | 'empty_cart'
        | 'address_required'
        | 'invalid_address'
        | 'invalid_input';
    }
  | { ok: false; error: 'insufficient_stock'; shortages: StockShortage[] }
  | { ok: false; error: 'shop_paused'; pausedShops: string[] };

/**
 * Thrown inside the transaction so the rollback is the language's own, rather
 * than a half-written order plus a flag the caller has to remember to check.
 */
class InsufficientStockError extends Error {
  constructor(readonly shortages: StockShortage[]) {
    super('insufficient_stock');
  }
}

export async function placeOrder(input: {
  fulfillment: 'delivery' | 'pickup';
  paymentMethod: 'cod' | 'hesabpay';
  addressId?: string;
  idempotencyKey?: string;
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

  /*
   * A shop that went on vacation AFTER this basket was filled.
   *
   * `addCartItem` refuses a paused shop, but a basket assembled yesterday
   * carries no such guarantee, and neither does the disabled buy button on a
   * page that was open when the pause began. This is the last gate before an
   * order the shopkeeper has said they cannot fulfil, so it is checked against
   * the database's own clock at submit time rather than trusted from the cart.
   *
   * The shops are NAMED in the error: "one of your shops is closed" sends the
   * customer back to a basket of several and makes them guess which.
   */
  const pausedShops = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(
      and(
        inArray(
          shops.id,
          cart.groups.map((group) => group.shopId),
        ),
        sql`${shops.pausedUntil} is not null and ${shops.pausedUntil} > now()`,
      ),
    );

  if (pausedShops.length > 0) {
    const [viewer] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const viewerLocale = (viewer?.locale ?? 'fa') as DbLocale;
    return {
      ok: false,
      error: 'shop_paused',
      pausedShops: pausedShops.map((shop) => pickLocale(shop.name, viewerLocale)),
    };
  }

  // A delivery address must belong to the person ordering.
  let addressSnapshot: OrderAddressSnapshot | null = null;
  if (parsed.data.fulfillment === 'delivery') {
    const [owned] = await db
      .select({
        id: addresses.id,
        label: addresses.label,
        district: addresses.district,
        street: addresses.streetDetails,
        phone: addresses.phone,
      })
      .from(addresses)
      .where(and(eq(addresses.id, parsed.data.addressId!), eq(addresses.userId, user.id)))
      .limit(1);
    if (!owned) return { ok: false, error: 'invalid_address' };

    /*
     * COPIED, not referenced. addresses.id is ON DELETE SET NULL and a customer
     * may tidy their address book while an order is still out for delivery; the
     * shopkeeper holding the parcel must not watch the destination disappear
     * (lib/db/schema/orders.ts).
     */
    addressSnapshot = {
      label: owned.label,
      district: owned.district,
      street: owned.street,
      phone: owned.phone,
    };
  }

  const discountTotal = cart.offerSavings;
  // The rates the admin set, not the constants — what the cart quoted and
  // what the order is charged have to come from the same row (A4).
  const deliveryFee = deliveryFeeFor(cart.total, parsed.data.fulfillment, await deliveryRates());
  const total = cart.total + deliveryFee;
  const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID();

  /*
   * Sorted by product id so concurrent checkouts touching the same two products
   * take their row locks in the same order. Unsorted, two baskets holding A and
   * B in opposite order deadlock, and Postgres kills one of them with an error
   * nobody can read.
   */
  const reservations = cart.groups
    .flatMap((group) =>
      group.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        title: line.title,
      })),
    )
    .sort((a, b) => a.productId.localeCompare(b.productId));

  let created: { id: string; reference: string };

  try {
    created = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          // Allocated by a sequence, not by a random draw (lib/db/sql/order-reference.sql).
          reference: sql`next_order_reference()`,
          userId: user.id,
          status: 'placed',
          fulfillment: parsed.data.fulfillment,
          paymentMethod: parsed.data.paymentMethod,
          addressId: parsed.data.fulfillment === 'delivery' ? parsed.data.addressId! : null,
          addressSnapshot,
          idempotencyKey,
          subtotal: cart.subtotal,
          discountTotal,
          deliveryFee,
          total,
        })
        .returning({ id: orders.id, reference: orders.reference });

      /*
       * THE RESERVATION. Conditional, so the row itself decides whether there
       * was enough: an UPDATE that matches nothing returns nothing, and
       * Postgres re-evaluates the predicate after waiting on a concurrent
       * writer's lock, which is exactly the check we want under a race.
       */
      const shortages: StockShortage[] = [];
      for (const line of reservations) {
        const [reserved] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${line.quantity}` })
          .where(and(eq(products.id, line.productId), gte(products.stock, line.quantity)))
          .returning({ id: products.id });

        if (reserved) continue;

        const [current] = await tx
          .select({ stock: products.stock })
          .from(products)
          .where(eq(products.id, line.productId))
          .limit(1);

        shortages.push({
          productId: line.productId,
          title: line.title,
          requested: line.quantity,
          available: Math.max(0, current?.stock ?? 0),
        });
      }

      // All or nothing: the customer chose a basket, not a subset of one.
      if (shortages.length > 0) throw new InsufficientStockError(shortages);

      await tx.insert(orderItems).values(
        cart.groups.flatMap((group) =>
          group.lines.map((line) => ({
            orderId: order.id,
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
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, error: 'insufficient_stock', shortages: error.shortages };
    }

    /*
     * THE SAME CHECKOUT ARRIVING TWICE — a double tap, or a retry after a
     * network timeout on a request that actually committed. The key is the
     * client's, so the second attempt is answered with the FIRST order rather
     * than with an error about an order the customer already has.
     */
    if (isUniqueViolation(error, 'orders_idempotency_key')) {
      const [existing] = await db
        .select({ id: orders.id, reference: orders.reference })
        .from(orders)
        .where(and(eq(orders.idempotencyKey, idempotencyKey), eq(orders.userId, user.id)))
        .limit(1);

      if (existing) {
        // The first attempt owns the notifications; sending them again would
        // put two "order placed" messages in the log for one order.
        await clearCart();
        revalidatePath('/cart');
        return {
          ok: true,
          reference: existing.reference,
          orderId: existing.id,
          duplicate: true,
        };
      }
    }
    throw error;
  }

  /*
   * THE CART GOES FIRST, before the notification fan-out.
   *
   * Everything below this line is best-effort messaging against an order that
   * already exists. It used to run before clearCart(), so a failure in that
   * window left the customer looking at a full basket for an order they had
   * placed — and the obvious response to that is to place it again.
   */
  await clearCart();
  revalidatePath('/cart');

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
        // Formatted in the SHOP's language, like the money beside it: a bare
        // number reaches ICU as a plain substitution, so a Dari message read
        // «با 1 قلم» with a Latin digit in the middle of the sentence.
        itemCount: formatNumber(itemCount, shopLocale),
        total: formatCurrency(group.total, shopLocale),
        shopName: pickLocale(group.shopName, shopLocale),
      },
    });
  }
  await notifyMany(shopMessages);

  revalidatePath('/account/orders');
  revalidatePath('/dashboard/orders');
  // The catalogue now shows fewer units of everything in the basket.
  revalidatePath('/products');

  return { ok: true, reference: created.reference, orderId: created.id };
}
