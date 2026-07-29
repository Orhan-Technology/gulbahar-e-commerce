import { and, asc, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';

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
import { orderItemImagePath, orderShopCount } from './fragments';

/**
 * The shopkeeper's view of orders (PRD §6.3).
 *
 * Every read is scoped THROUGH order_items, because an order may span shops
 * (PRD §14): a shopkeeper must see their own lines and their own subtotal, never
 * the whole basket. The customer's contact details are shared — they have to be,
 * or the shop cannot fulfil — but another shop's products are not.
 */

/** Statuses that need the shopkeeper to do something, in the order they appear. */
export const ACTIONABLE_STATUSES: OrderStatus[] = ['placed', 'accepted', 'ready'];

/**
 * Windows the dashboard's KPI tiles drill into (PRD §6.1).
 *
 * The tile says "orders this week"; tapping it must land on THOSE orders and
 * not on an unfiltered list the shopkeeper then has to narrow by hand — a
 * drill-down that drops its filter is worse than no link at all, because the
 * count on the next screen silently disagrees with the number just tapped.
 *
 * Day counts, and they match the windows `shopDashboardStats` measures: both
 * are whole days ending today, so the list length and the tile figure are the
 * same number by construction.
 */
export const ORDER_RANGES = { '1d': 1, '7d': 7, '30d': 30 } as const;
export type OrderRange = keyof typeof ORDER_RANGES;

export const isOrderRange = (value: unknown): value is OrderRange =>
  typeof value === 'string' && value in ORDER_RANGES;

export type ShopOrderFilters = {
  shopId: string;
  status?: OrderStatus;
  /** 'actionable' collapses placed+accepted+ready into the working queue. */
  bucket?: 'actionable';
  range?: OrderRange;
  limit?: number;
};

/** Start of the window `range` covers, at midnight UTC. */
export function orderRangeStart(range: OrderRange, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (ORDER_RANGES[range] - 1));
  return start;
}

export async function shopOrderList(filters: ShopOrderFilters) {
  const conditions: SQL[] = [eq(orderItems.shopId, filters.shopId)];
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  else if (filters.bucket === 'actionable') {
    conditions.push(inArray(orders.status, ACTIONABLE_STATUSES));
  }
  if (filters.range) {
    conditions.push(gte(orders.createdAt, orderRangeStart(filters.range)));
    // Matches the KPI tile, which counts business received and so excludes the
    // orders this shop turned away.
    conditions.push(sql`${orders.status} <> 'rejected'`);
  }

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
      // Only this shop's lines count towards what the shopkeeper is shown.
      shopItemCount: sql<number>`sum(${orderItems.quantity})::int`,
      shopSubtotal: sql<number>`sum(${orderItems.priceSnapshot} * ${orderItems.quantity})::int`,
      shopCount: orderShopCount,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(...conditions))
    .groupBy(orders.id, users.id)
    .orderBy(desc(orders.createdAt))
    .limit(filters.limit ?? 200);
}

/** Counts for the filter chips, from the same predicates the filters use. */
export async function shopOrderCounts(shopId: string) {
  const [row] = await db
    .select({
      all: sql<number>`count(distinct ${orders.id})::int`,
      placed: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} = 'placed')::int`,
      accepted: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} = 'accepted')::int`,
      ready: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} = 'ready')::int`,
      fulfilled: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} = 'fulfilled')::int`,
      rejected: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} = 'rejected')::int`,
      actionable: sql<number>`count(distinct ${orders.id}) filter (where ${orders.status} in ('placed','accepted','ready'))::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(eq(orderItems.shopId, shopId));

  return (
    row ?? {
      all: 0,
      placed: 0,
      accepted: 0,
      ready: 0,
      fulfilled: 0,
      rejected: 0,
      actionable: 0,
    }
  );
}

/**
 * One order, as this shop is allowed to see it.
 *
 * Returns null when the shop has no line in the order, which is the ownership
 * check — the caller never has to remember to make it.
 */
export async function shopOrderDetail(shopId: string, orderId: string) {
  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      paymentMethod: orders.paymentMethod,
      total: orders.total,
      deliveryFee: orders.deliveryFee,
      createdAt: orders.createdAt,
      customerId: users.id,
      customerName: users.name,
      customerPhone: users.phone,
      customerLocale: users.locale,
      addressLabel: addresses.label,
      addressDistrict: addresses.district,
      addressStreet: addresses.streetDetails,
      addressPhone: addresses.phone,
      shopCount: orderShopCount,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(addresses, eq(orders.addressId, addresses.id))
    // The shop must have a line in this order; without it, no row comes back.
    .where(
      and(
        eq(orders.id, orderId),
        sql`exists (select 1 from order_items oi where oi.order_id = orders.id and oi.shop_id = ${shopId})`,
      ),
    )
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
        imagePath: orderItemImagePath,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      // Only this shop's lines.
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.shopId, shopId))),
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

  const shopSubtotal = items.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);

  return { ...order, items, events, shopSubtotal };
}

/**
 * Shop name for a notification body. Kept here rather than re-fetched in the
 * action so the templates always name the shop in the recipient's own language.
 */
export async function shopNameFor(shopId: string) {
  const [row] = await db
    .select({ name: shops.name, slug: shops.slug })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);
  return row ?? null;
}
