import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '..';
import { campaigns, orderItems, orders, products, wishlistItems } from '../schema';

/**
 * Everything the shop dashboard home needs in one call (PRD §6.1).
 *
 * The dashboard has to answer two questions in three seconds — did I make money,
 * and what needs my attention — so the action-queue counts are computed here
 * rather than left to the page.
 *
 * Every figure is scoped through order_items.shop_id: an order may span shops,
 * and a shopkeeper must only ever see their own lines (PRD §3.1).
 */
export type ShopDashboardStats = Awaited<ReturnType<typeof shopDashboardStats>>;

export async function shopDashboardStats(shopId: string, now: Date = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 6);

  const start30 = new Date(startOfToday);
  start30.setUTCDate(start30.getUTCDate() - 29);

  const in7Days = new Date(now);
  in7Days.setUTCDate(in7Days.getUTCDate() + 7);

  /** This shop's revenue over a window, counting fulfilled orders only. */
  const revenueSince = (since: Date) =>
    db
      .select({
        total: sql<number>`coalesce(sum(${orderItems.priceSnapshot} * ${orderItems.quantity}), 0)`,
        orderCount: sql<number>`count(distinct ${orders.id})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.shopId, shopId),
          gte(orders.createdAt, since),
          eq(orders.status, 'fulfilled'),
        ),
      );

  const [
    todayRows,
    weekRows,
    awaitingRows,
    liveProductRows,
    outOfStockRows,
    expiringRows,
    seriesRows,
    topProductRows,
  ] = await Promise.all([
    revenueSince(startOfToday),
    revenueSince(startOfWeek),

    // Action queue: orders sitting at placed (accept/reject) or accepted (mark ready).
    db
      .select({ status: orders.status, total: sql<number>`count(distinct ${orders.id})` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.shopId, shopId),
          sql`${orders.status} in ('placed', 'accepted', 'ready')`,
        ),
      )
      .groupBy(orders.status),

    db
      .select({ total: count() })
      .from(products)
      .where(and(eq(products.shopId, shopId), eq(products.status, 'published'))),

    db
      .select({ total: count() })
      .from(products)
      .where(
        and(
          eq(products.shopId, shopId),
          eq(products.status, 'published'),
          sql`${products.stock} <= 0`,
        ),
      ),

    // Promotions expiring within 7 days (PRD §6.1).
    db
      .select({ total: count() })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.shopId, shopId),
          eq(campaigns.status, 'active'),
          sql`${campaigns.endsAt} <= ${in7Days.toISOString()}`,
        ),
      ),

    /*
     * 30-day sales series. generate_series produces a row per day so the chart
     * has no gaps — a missing day would otherwise render as a straight line
     * between two points and misrepresent a quiet day as no data.
     */
    db.execute(sql`
      select
        d::date as day,
        coalesce(sum(oi.price_snapshot * oi.quantity), 0)::int as revenue,
        count(distinct o.id)::int as order_count
      from generate_series(${start30.toISOString()}::date, ${startOfToday.toISOString()}::date, '1 day') as d
      left join orders o
        on o.created_at::date = d::date and o.status = 'fulfilled'
      left join order_items oi
        on oi.order_id = o.id and oi.shop_id = ${shopId}
      group by d
      order by d asc
    `),

    /*
     * Top products by revenue, with the views and wishlist saves PRD §6.1 asks
     * for. Written as one aggregate scan with explicit aliases rather than
     * correlated subqueries: drizzle renders an interpolated `${products.id}`
     * unqualified inside a sql template, which is ambiguous against the joined
     * order_items.id (see lib/db/queries/fragments.ts for the full explanation).
     */
    db.execute(sql`
      select
        p.id,
        p.slug,
        p.title,
        p.view_count,
        (
          select pi.path from product_images pi
          where pi.product_id = p.id
          order by pi.sort asc limit 1
        ) as image_path,
        coalesce(sum(oi.quantity) filter (where o.status = 'fulfilled'), 0)::int as order_count,
        coalesce(sum(oi.price_snapshot * oi.quantity) filter (where o.status = 'fulfilled'), 0)::int as revenue,
        (select count(*) from wishlist_items wi where wi.product_id = p.id)::int as wishlist_count
      from products p
      left join order_items oi on oi.product_id = p.id
      left join orders o on o.id = oi.order_id
      where p.shop_id = ${shopId}
      group by p.id
      order by revenue desc, p.view_count desc
      limit 8
    `),
  ]);

  const awaiting = Object.fromEntries(awaitingRows.map((row) => [row.status, Number(row.total)]));

  return {
    todaySales: Number(todayRows[0]?.total ?? 0),
    weekSales: Number(weekRows[0]?.total ?? 0),
    todayOrderCount: Number(todayRows[0]?.orderCount ?? 0),
    weekOrderCount: Number(weekRows[0]?.orderCount ?? 0),
    liveProducts: Number(liveProductRows[0]?.total ?? 0),
    actionQueue: {
      newOrders: awaiting.placed ?? 0,
      toMarkReady: awaiting.accepted ?? 0,
      readyForHandover: awaiting.ready ?? 0,
      outOfStockProducts: Number(outOfStockRows[0]?.total ?? 0),
      expiringPromotions: Number(expiringRows[0]?.total ?? 0),
    },
    /** Total items the shopkeeper must act on — drives the stat card. */
    get ordersAwaitingAction() {
      return this.actionQueue.newOrders + this.actionQueue.toMarkReady;
    },
    salesSeries: (
      seriesRows as unknown as Array<{ day: string; revenue: number; order_count: number }>
    ).map((row) => ({
      day: String(row.day),
      revenue: Number(row.revenue),
      orderCount: Number(row.order_count),
    })),
    topProducts: (
      topProductRows as unknown as Array<{
        id: string;
        slug: string;
        title: Record<string, string>;
        view_count: number;
        image_path: string | null;
        order_count: number;
        revenue: number;
        wishlist_count: number;
      }>
    ).map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      viewCount: Number(row.view_count),
      imagePath: row.image_path,
      orderCount: Number(row.order_count),
      revenue: Number(row.revenue),
      wishlistCount: Number(row.wishlist_count),
    })),
  };
}

/** Rating trend for the shopkeeper's reports (PRD §6.7). */
export async function shopRatingTrend(shopId: string, since: Date) {
  const rows = await db.execute(sql`
    select
      date_trunc('week', r.created_at)::date as week,
      round(avg(r.rating)::numeric, 2)::float8 as average,
      count(*)::int as total
    from reviews r
    join products p on p.id = r.product_id
    where p.shop_id = ${shopId}
      and r.status = 'visible'
      and r.created_at >= ${since.toISOString()}
    group by week
    order by week asc
  `);

  return (rows as unknown as Array<{ week: string; average: number; total: number }>).map(
    (row) => ({
      week: String(row.week),
      average: Number(row.average),
      total: Number(row.total),
    }),
  );
}

/** Most-wishlisted products, exposed to the shopkeeper as demand signal (PRD §5.6). */
export async function topWishlisted(shopId: string, limit = 8) {
  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      saves: count(wishlistItems.productId),
    })
    .from(products)
    .leftJoin(wishlistItems, eq(wishlistItems.productId, products.id))
    .where(eq(products.shopId, shopId))
    .groupBy(products.id)
    .orderBy(desc(count(wishlistItems.productId)))
    .limit(limit);
}

/** Review count awaiting a shopkeeper response, for the reviews tab badge. */
export async function unansweredReviewCount(shopId: string) {
  const [row] = (await db.execute(sql`
    select count(*)::int as total
    from reviews r
    join products p on p.id = r.product_id
    left join review_responses rr on rr.review_id = r.id
    where p.shop_id = ${shopId} and r.status = 'visible' and rr.id is null
  `)) as unknown as Array<{ total: number }>;

  return Number(row?.total ?? 0);
}
