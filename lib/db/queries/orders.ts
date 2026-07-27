import { and, asc, count, desc, eq, gte, inArray, sql, sum, type SQL } from 'drizzle-orm';

import { db } from '..';
import {
  addresses,
  orderEvents,
  orderItems,
  orders,
  products,
  shops,
  users,
  type OrderStatus,
} from '../schema';
import { orderItemImagePath, orderItemQuantity, orderShopCount } from './fragments';

/**
 * One order with its items and full append-only event chain — the payload behind
 * the customer's tracking screen (PRD §5.4) and the admin's read-only detail
 * view (PRD §7.4).
 */
export async function orderWithTimeline(orderId: string) {
  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      paymentMethod: orders.paymentMethod,
      subtotal: orders.subtotal,
      discountTotal: orders.discountTotal,
      deliveryFee: orders.deliveryFee,
      total: orders.total,
      createdAt: orders.createdAt,
      customerId: users.id,
      customerName: users.name,
      customerPhone: users.phone,
      addressLabel: addresses.label,
      addressDistrict: addresses.district,
      addressStreet: addresses.streetDetails,
      addressPhone: addresses.phone,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(addresses, eq(orders.addressId, addresses.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return null;

  const [items, events] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productSlug: products.slug,
        titleSnapshot: orderItems.titleSnapshot,
        priceSnapshot: orderItems.priceSnapshot,
        quantity: orderItems.quantity,
        variantSelection: orderItems.variantSelection,
        shopId: shops.id,
        shopName: shops.name,
        shopSlug: shops.slug,
        shopFloor: shops.floor,
        shopUnitNumber: shops.unitNumber,
        imagePath: orderItemImagePath,
      })
      .from(orderItems)
      .innerJoin(shops, eq(orderItems.shopId, shops.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId)),
    db
      .select({
        id: orderEvents.id,
        fromStatus: orderEvents.fromStatus,
        toStatus: orderEvents.toStatus,
        note: orderEvents.note,
        createdAt: orderEvents.createdAt,
        actorName: users.name,
      })
      .from(orderEvents)
      .leftJoin(users, eq(orderEvents.actorUserId, users.id))
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(asc(orderEvents.createdAt)),
  ]);

  return { ...order, items, events };
}

export async function orderByReference(reference: string) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.reference, reference))
    .limit(1);
  return row ? orderWithTimeline(row.id) : null;
}

/** A customer's order history (PRD §5.4). */
export async function customerOrders(userId: string) {
  return db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      total: orders.total,
      createdAt: orders.createdAt,
      itemCount: orderItemQuantity,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
}

/**
 * Orders visible to one shop (PRD §3.1, §6.3).
 *
 * Scoped through order_items, because an order may span shops — a shopkeeper
 * must only ever see their own lines, never the whole basket.
 */
export async function shopOrders(shopId: string, statuses?: OrderStatus[]) {
  const conditions: SQL[] = [eq(orderItems.shopId, shopId)];
  if (statuses?.length) conditions.push(inArray(orders.status, statuses));

  return db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      paymentMethod: orders.paymentMethod,
      createdAt: orders.createdAt,
      customerName: users.name,
      customerPhone: users.phone,
      // Only this shop's lines contribute to the total the shopkeeper sees.
      shopItemCount: sql<number>`sum(${orderItems.quantity})`,
      shopSubtotal: sql<number>`sum(${orderItems.priceSnapshot} * ${orderItems.quantity})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(...conditions))
    .groupBy(orders.id, users.id)
    .orderBy(desc(orders.createdAt));
}

/** Platform-wide order list for admin (PRD §7.4). */
export async function allOrders(statuses?: OrderStatus[], limit = 100) {
  const conditions: SQL[] = [];
  if (statuses?.length) conditions.push(inArray(orders.status, statuses));

  return db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      paymentMethod: orders.paymentMethod,
      total: orders.total,
      createdAt: orders.createdAt,
      customerName: users.name,
      shopCount: orderShopCount,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

/**
 * Platform reporting figures (PRD §7.4): GMV, order volume, active shops.
 */
export async function platformStats(since: Date) {
  const [totals] = await db
    .select({
      gmv: sum(orders.total),
      orderCount: count(orders.id),
    })
    .from(orders)
    .where(and(gte(orders.createdAt, since), eq(orders.status, 'fulfilled')));

  const [{ activeShops } = { activeShops: 0 }] = await db
    .select({ activeShops: count() })
    .from(shops)
    .where(eq(shops.status, 'approved'));

  const byStatus = await db
    .select({ status: orders.status, total: count() })
    .from(orders)
    .where(gte(orders.createdAt, since))
    .groupBy(orders.status);

  return {
    gmv: Number(totals?.gmv ?? 0),
    orderCount: Number(totals?.orderCount ?? 0),
    activeShops: Number(activeShops),
    byStatus: Object.fromEntries(byStatus.map((row) => [row.status, Number(row.total)])),
  };
}
