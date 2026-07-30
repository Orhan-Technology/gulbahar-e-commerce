import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from '..';
import { parseConsoleRange, type ConsoleRange } from '../../console-range';
import type { QueueClass } from '../../queue-sla';
import { pickLocale } from '../localized';
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

/** Matches the storefront's own "only N left" threshold (PRD §5.2). */
const LOW_STOCK_THRESHOLD = 5;

/**
 * The dashboard's trailing window, in days.
 *
 * One constant so the chart, the best sellers and the label under them cannot
 * disagree — and so the number in the heading is the number in the query.
 */
export const TREND_DAYS = 30;

/**
 * Everything the dashboard home shows, for ONE window (Prompts C2, C3).
 *
 * `range` comes from the URL (`?range=30d`) and every figure below obeys it —
 * the KPI values, their deltas, the chart and the best-seller list. The
 * comparison period is the equally-long stretch immediately before it, derived
 * rather than configured, so a value and its delta can never be computed over
 * different spans.
 *
 * `today` is the one figure that does NOT scale with the range, and that is
 * deliberate: "today's takings" answers a question about right now, and a
 * shopkeeper who widens the window to ninety days has not stopped caring what
 * came in this morning.
 */
export async function shopDashboardStats(
  shopId: string,
  range: ConsoleRange = parseConsoleRange(undefined),
  now: Date = new Date(),
) {
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setUTCDate(startOfYesterday.getUTCDate() - 1);

  /*
   * Yesterday measured only as far into the day as today has got.
   *
   * Comparing a morning's takings against a whole previous day is not a
   * comparison — it reports a collapse every day until closing time, on the
   * lead tile of the dashboard. This window closes at the same clock time, so
   * the delta means "ahead of or behind where I was this time yesterday",
   * which is the question a shopkeeper is actually asking.
   */
  const yesterdayToNow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  /*
   * THE window and its comparison, both from lib/console-range.ts. Named
   * `startOfWeek`/`startOfPrevWeek` no longer — they are whatever the reader
   * asked for, and the labels above them say so.
   */
  const windowStart = range.start;
  const previousStart = range.previousStart;

  // The chart and the best-seller list share the selected window (Prompt C2).
  const start30 = windowStart;

  const in7Days = new Date(now);
  in7Days.setUTCDate(in7Days.getUTCDate() + 7);

  /**
   * This shop's revenue over a window, counting fulfilled orders only — money
   * isn't earned until an order is fulfilled, so a placed or accepted order
   * cannot appear in a sales figure no matter how large it is. `until` is
   * exclusive, which is what makes a closed window — yesterday — expressible
   * without a second helper.
   *
   * Deliberately a DIFFERENT predicate than `ordersBetween` below — one counts
   * money, the other counts business received — so don't unify them. What
   * must never happen is a metric's current window, its previous window and
   * the number the tile displays reading through three different predicates:
   * every caller of `revenueBetween` for a given metric (today/yesterday,
   * week/prev-week) routes through this ONE function, so they cannot drift
   * apart from each other.
   */
  const revenueBetween = (since: Date, until?: Date) =>
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
          until ? lt(orders.createdAt, until) : undefined,
          eq(orders.status, 'fulfilled'),
        ),
      );

  /**
   * Orders RECEIVED in a window, whatever became of them — the KPI is "how much
   * business came in", so an order still sitting at placed counts. Rejected
   * ones do not: the shopkeeper turned those away, and counting them would let
   * a bad week look like a good one.
   *
   * The orders tile's displayed count, its current-week delta input and its
   * previous-week delta input are three separate calls to this ONE function
   * (see `rangeOrderCount` / `previousOrderCount` below) — never let one of the
   * three read a different predicate or window than the others. A tile whose
   * number and whose delta pill disagree about what counts as "an order" is
   * how a dashboard shows 0 orders with a +400% delta at the same time.
   */
  const ordersBetween = (since: Date, until?: Date) =>
    db
      .select({ total: sql<number>`count(distinct ${orders.id})` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.shopId, shopId),
          gte(orders.createdAt, since),
          until ? lt(orders.createdAt, until) : undefined,
          sql`${orders.status} <> 'rejected'`,
        ),
      );

  /** Product views over a window, summed across this shop's whole catalogue. */
  const viewsBetween = (since: Date, until: Date) =>
    db.execute(sql`
      select coalesce(sum(v.views), 0)::int as total
      from product_view_days v
      join products p on p.id = v.product_id
      where p.shop_id = ${shopId}
        and v.day >= ${since.toISOString().slice(0, 10)}::date
        and v.day < ${until.toISOString().slice(0, 10)}::date
    `);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);

  const [
    todayRows,
    yesterdayRows,
    weekRows,
    weekOrderRows,
    prevWeekOrderRows,
    weekViewRows,
    prevWeekViewRows,
    ratingRows,
    awaitingRows,
    liveProductRows,
    outOfStockRows,
    lowStockRows,
    expiringRows,
    seriesRows,
    topProductRows,
  ] = await Promise.all([
    revenueBetween(startOfToday),
    revenueBetween(startOfYesterday, yesterdayToNow),
    revenueBetween(windowStart),
    ordersBetween(windowStart),
    ordersBetween(previousStart, windowStart),
    viewsBetween(windowStart, startOfTomorrow),
    viewsBetween(previousStart, windowStart),

    // Shop rating: the average a customer sees, over this shop's own products.
    db.execute(sql`
      select
        coalesce(round(avg(r.rating)::numeric, 2), 0)::float8 as average,
        count(*)::int as total
      from reviews r
      join products p on p.id = r.product_id
      where p.shop_id = ${shopId} and r.status = 'visible'
    `),

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

    // Still sellable but nearly gone — the warning that lets a shopkeeper
    // restock BEFORE the product drops out of the catalogue.
    db
      .select({ total: count() })
      .from(products)
      .where(
        and(
          eq(products.shopId, shopId),
          eq(products.status, 'published'),
          sql`${products.stock} > 0 and ${products.stock} <= ${LOW_STOCK_THRESHOLD}`,
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
     * Best sellers, ordered by UNITS rather than by revenue.
     *
     * They are different lists and the difference matters: by revenue, one
     * laptop outranks forty phone cases, and a shopkeeper reading "best
     * sellers" means the cases. Revenue is still shown on the row — it is the
     * second thing you want once you know what is moving — so nothing is lost
     * by ranking on the honest column.
     *
     * THE WINDOW IS THE CHART'S WINDOW (Prompt C2), and that is a bug fix, not
     * a refinement. This counted every fulfilled order since the shop opened
     * while the chart above it covered thirty days, so single products showed
     * ؋ 628,200 and ؋ 644,000 beside a thirty-day total of ؋ 602,900 — three
     * numbers on one screen that cannot all be true. Two figures that sit next
     * to each other have to answer the same question over the same period, and
     * the heading now says which period that is.
     *
     * Written as one aggregate scan with explicit aliases rather than
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
      left join order_items oi
        on oi.product_id = p.id and oi.shop_id = ${shopId}
      left join orders o
        on o.id = oi.order_id
        and o.created_at >= ${start30.toISOString()}::timestamptz
      where p.shop_id = ${shopId}
      group by p.id
      order by order_count desc, revenue desc, p.view_count desc
      limit 5
    `),
  ]);

  const awaiting = Object.fromEntries(awaitingRows.map((row) => [row.status, Number(row.total)]));

  const todaySales = Number(todayRows[0]?.total ?? 0);
  const yesterdaySales = Number(yesterdayRows[0]?.total ?? 0);

  // Both from `ordersBetween` (see above) — the value the tile shows and the
  // two inputs to its delta, sharing one predicate and one window shape.
  const rangeOrderCount = Number(weekOrderRows[0]?.total ?? 0);
  const previousOrderCount = Number(prevWeekOrderRows[0]?.total ?? 0);

  const [weekViewRow] = weekViewRows as unknown as Array<{ total: number }>;
  const [prevWeekViewRow] = prevWeekViewRows as unknown as Array<{ total: number }>;
  const rangeViews = Number(weekViewRow?.total ?? 0);
  const previousViews = Number(prevWeekViewRow?.total ?? 0);

  const [ratingRow] = ratingRows as unknown as Array<{ average: number; total: number }>;

  /**
   * Signed fraction against the previous window, or null when there is nothing
   * to compare against. Never Infinity, and never "+100%" out of a zero — see
   * `todayDelta` for why an unbaselined comparison is worse than no comparison.
   */
  const delta = (current: number, previous: number) =>
    previous > 0 ? (current - previous) / previous : null;

  return {
    todaySales,
    yesterdaySales,
    /**
     * Signed fraction against the same hours yesterday, or null when there is
     * no baseline — "+100% on a day the shop was shut" is not a fact worth
     * showing, and the tile drops the line entirely rather than printing an
     * infinity.
     */
    todayDelta: yesterdaySales > 0 ? (todaySales - yesterdaySales) / yesterdaySales : null,
    rangeSales: Number(weekRows[0]?.total ?? 0),
    /** The window every figure above obeys, so the UI can label it. */
    rangeDays: range.days,
    todayOrderCount: Number(todayRows[0]?.orderCount ?? 0),
    rangeOrderCount,
    previousOrderCount,
    ordersDelta: delta(rangeOrderCount, previousOrderCount),
    rangeViews,
    previousViews,
    viewsDelta: delta(rangeViews, previousViews),
    /**
     * The rating a customer sees on the shop card, so the dashboard and the
     * storefront cannot disagree about how the shop is doing.
     */
    rating: {
      average: Number(ratingRow?.average ?? 0),
      count: Number(ratingRow?.total ?? 0),
    },
    liveProducts: Number(liveProductRows[0]?.total ?? 0),
    lowStockProducts: Number(lowStockRows[0]?.total ?? 0),
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

/**
 * Rating trend for the shopkeeper's reports (PRD §6.7) — weekly average over the
 * last `days`.
 *
 * Takes a day count rather than a Date so the clock is read HERE and not in a
 * component: React 19's purity rule forbids Date.now() during render, and the
 * window a report covers is a property of the query anyway.
 */
export async function shopRatingTrend(shopId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
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

export type ActionQueueEntry = {
  /**
   * What the row costs while it waits (Prompt C4): a customer, the shop's
   * standing, or neither. Rows are grouped by this before they are sorted.
   */
  urgency: QueueClass;
  kind:
    | 'new_order'
    | 'to_ready'
    | 'needs_reply'
    | 'needs_answer'
    | 'out_of_stock'
    | 'expiring_promotion';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  at: Date;
};

/**
 * The actual rows behind the action queue, not just the counts (PRD §6.1).
 *
 * The queue is the dashboard centrepiece, and its whole value is that each item
 * DEEP-LINKS to the exact screen and record needing attention — a list of counts
 * would still leave the shopkeeper hunting. Ordered most-urgent-first: new orders
 * before orders to mark ready, then stock, then promotions about to lapse.
 */
export async function actionQueueItems(
  shopId: string,
  locale: string,
  now: Date = new Date(),
): Promise<ActionQueueEntry[]> {
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [orderRows, reviewRows, questionRows, stockRows, promoRows] = await Promise.all([
    // Orders sitting at placed (accept/reject) or accepted (mark ready), scoped
    // to this shop's own lines.
    db.execute(sql`
      select o.id, o.reference, o.status, o.created_at,
             sum(oi.quantity)::int as item_count,
             sum(oi.price_snapshot * oi.quantity)::int as shop_total
      from orders o
      join order_items oi on oi.order_id = o.id
      where oi.shop_id = ${shopId} and o.status in ('placed', 'accepted')
      group by o.id
      order by o.created_at asc
      limit 12
    `),
    /*
     * Reviews with no shop response yet (PRD §6.5).
     *
     * An unanswered review is work in exactly the way a new order is — it is
     * public, it is addressed to the shop, and it stays visible until someone
     * replies — so it belongs in the queue rather than behind a tab. Low
     * ratings lead: those are the ones a reply actually rescues.
     */
    db.execute(sql`
      select r.id, r.rating, r.created_at, p.title
      from reviews r
      join products p on p.id = r.product_id
      left join review_responses rr on rr.review_id = r.id
      where p.shop_id = ${shopId} and r.status = 'visible' and rr.id is null
      order by r.rating asc, r.created_at asc
      limit 4
    `),
    /*
     * Unanswered customer questions (Prompt P4).
     *
     * Ranked directly under new orders rather than with the reviews: a question
     * is a customer who has NOT bought yet and is waiting on the shop to
     * decide, so answering it is closer to taking an order than to replying to
     * one. Oldest first — the one that has been waiting longest.
     */
    db.execute(sql`
      select q.id, q.body, q.created_at, p.title
      from product_questions q
      join products p on p.id = q.product_id
      where q.shop_id = ${shopId} and q.status = 'pending'
      order by q.created_at asc
      limit 6
    `),
    db.execute(sql`
      select p.id, p.slug, p.title, p.created_at
      from products p
      where p.shop_id = ${shopId} and p.status = 'published' and p.stock <= 0
      order by p.title->>'fa' asc
      limit 8
    `),
    db.execute(sql`
      select c.id, c.ends_at, ps.name as slot_name
      from campaigns c
      join promotion_slots ps on ps.id = c.slot_id
      where c.shop_id = ${shopId} and c.status = 'active' and c.ends_at <= ${in7Days.toISOString()}
      order by c.ends_at asc
      limit 6
    `),
  ]);

  const orders_ = orderRows as unknown as Array<{
    id: string;
    reference: string;
    status: string;
    created_at: string;
    item_count: number;
    shop_total: number;
  }>;
  const unanswered = reviewRows as unknown as Array<{
    id: string;
    rating: number;
    created_at: string;
    title: Record<string, string>;
  }>;
  const questions = questionRows as unknown as Array<{
    id: string;
    body: string;
    created_at: string;
    title: Record<string, string>;
  }>;
  const stock = stockRows as unknown as Array<{
    id: string;
    slug: string;
    title: Record<string, string>;
    created_at: string;
  }>;
  const promos = promoRows as unknown as Array<{
    id: string;
    ends_at: string;
    slot_name: Record<string, string>;
  }>;

  const entries: ActionQueueEntry[] = [
    ...orders_.map((row): ActionQueueEntry => ({
      // A customer placed this and is waiting for an answer.
      urgency: 'blocking',
      kind: row.status === 'placed' ? 'new_order' : 'to_ready',
      id: row.id,
      title: row.reference,
      subtitle: `${row.item_count}|${row.shop_total}`,
      href: `/dashboard/orders/${row.reference}`,
      at: new Date(row.created_at),
    })),
    ...unanswered.map((row): ActionQueueEntry => ({
      // Nobody is blocked, but it is public and it is about the shop.
      urgency: 'important',
      kind: 'needs_reply',
      id: row.id,
      title: pickLocale(row.title as never, locale),
      subtitle: String(row.rating),
      // Deep-links with the composer already open on this review, so replying
      // is one tap from the queue rather than a hunt through the list.
      // Filtered to unanswered as well as targeted: the composer opens on the
      // named review, and the list behind it is the rest of the same job.
      href: `/dashboard/reviews?unanswered=1&reply=${row.id}`,
      at: new Date(row.created_at),
    })),
    ...questions.map((row): ActionQueueEntry => ({
      // Someone is deciding whether to buy and cannot until this is answered.
      urgency: 'blocking',
      kind: 'needs_answer',
      id: row.id,
      title: pickLocale(row.title as never, locale),
      subtitle: row.body,
      // Deep-links with the composer open on this question, the same shape the
      // review row uses — the queue is a place to DO the work, not to find it.
      href: `/dashboard/questions?status=pending&answer=${row.id}`,
      at: new Date(row.created_at),
    })),
    ...stock.map((row): ActionQueueEntry => ({
      urgency: 'important',
      kind: 'out_of_stock',
      id: row.id,
      title: pickLocale(row.title as never, locale),
      subtitle: '',
      href: `/dashboard/products?status=published&stock=out`,
      at: new Date(row.created_at),
    })),
    ...promos.map((row): ActionQueueEntry => ({
      urgency: 'housekeeping',
      kind: 'expiring_promotion',
      id: row.id,
      title: pickLocale(row.slot_name as never, locale),
      subtitle: row.ends_at,
      href: '/dashboard/promotions',
      at: new Date(row.ends_at),
    })),
  ];

  /*
   * CLASS FIRST, then age (Prompt C4). Within a class the oldest row leads,
   * because the thing that has been waiting longest is the thing to do next —
   * which is the opposite of the storefront, where newest wins.
   *
   * `kind` still breaks ties inside a class so the ordering is stable between
   * renders; without it two rows created in the same second could swap places
   * on every refresh.
   */
  const classRank: Record<QueueClass, number> = { blocking: 0, important: 1, housekeeping: 2 };
  const kindRank: Record<ActionQueueEntry['kind'], number> = {
    new_order: 0,
    needs_answer: 1,
    to_ready: 2,
    needs_reply: 3,
    out_of_stock: 4,
    expiring_promotion: 5,
  };

  return entries.sort(
    (a, b) =>
      classRank[a.urgency] - classRank[b.urgency] ||
      a.at.getTime() - b.at.getTime() ||
      kindRank[a.kind] - kindRank[b.kind],
  );
}
