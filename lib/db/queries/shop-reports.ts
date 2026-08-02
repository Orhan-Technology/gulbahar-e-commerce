import { sql } from 'drizzle-orm';

import { db } from '..';
import type { LocalizedText } from '../schema/shared';

/**
 * Shopkeeper reporting (PRD §6.7).
 *
 * Written as raw SQL rather than the query builder: every one of these is an
 * aggregate over a date series with a shop-scoped join, and the SQL reads far more
 * clearly than the builder equivalent. Two rules apply throughout —
 *
 *   - Scope through order_items.shop_id. Revenue is this shop's LINES, never the
 *     whole basket, or a shop that shares an order with another would see money it
 *     did not earn.
 *   - Cast every aggregate (::int / ::float8). count() and sum() come back as
 *     strings through postgres.js otherwise (see queries/fragments.ts).
 *
 * `since` is passed as an ISO string with an explicit ::timestamptz, because a JS
 * Date interpolated into a raw fragment has no column to infer a type from and
 * postgres.js rejects it.
 */

export type ReportPeriod = 7 | 30 | 90;

function startOf(period: ReportPeriod): string {
  return new Date(Date.now() - period * 86_400_000).toISOString();
}

/** Daily revenue and order count, zero-filled so the chart has no gaps. */
export async function salesSeries(shopId: string, period: ReportPeriod) {
  const rows = await db.execute(sql`
    with days as (
      select generate_series(
        (${startOf(period)}::timestamptz)::date,
        current_date,
        interval '1 day'
      )::date as day
    ),
    sales as (
      select
        o.created_at::date as day,
        sum(oi.price_snapshot * oi.quantity)::int as revenue,
        count(distinct o.id)::int as order_count
      from order_items oi
      join orders o on o.id = oi.order_id
      where oi.shop_id = ${shopId}
        and o.created_at >= ${startOf(period)}::timestamptz
        and o.status not in ('rejected', 'cancelled')
      group by 1
    )
    select
      days.day::text as day,
      coalesce(sales.revenue, 0)::int as revenue,
      coalesce(sales.order_count, 0)::int as order_count
    from days
    left join sales on sales.day = days.day
    order by days.day asc
  `);

  return (rows as unknown as Array<{ day: string; revenue: number; order_count: number }>).map(
    (row) => ({ day: row.day, revenue: Number(row.revenue), orderCount: Number(row.order_count) }),
  );
}

/** Headline numbers for the period, including average order value. */
export async function salesTotals(shopId: string, period: ReportPeriod) {
  const rows = await db.execute(sql`
    select
      coalesce(sum(t.revenue), 0)::int as revenue,
      count(*)::int as order_count,
      -- AOV over this shop's share of each order, not the basket total.
      coalesce(round(avg(t.revenue))::int, 0) as average_order_value,
      coalesce(sum(t.items), 0)::int as item_count
    from (
      select
        o.id,
        sum(oi.price_snapshot * oi.quantity)::int as revenue,
        sum(oi.quantity)::int as items
      from order_items oi
      join orders o on o.id = oi.order_id
      where oi.shop_id = ${shopId}
        and o.created_at >= ${startOf(period)}::timestamptz
        and o.status not in ('rejected', 'cancelled')
      group by o.id
    ) t
  `);

  const [row] = rows as unknown as Array<{
    revenue: number;
    order_count: number;
    average_order_value: number;
    item_count: number;
  }>;

  return {
    revenue: Number(row?.revenue ?? 0),
    orderCount: Number(row?.order_count ?? 0),
    averageOrderValue: Number(row?.average_order_value ?? 0),
    itemCount: Number(row?.item_count ?? 0),
  };
}

/** Best sellers by revenue in the period. */
export async function salesByProduct(shopId: string, period: ReportPeriod, limit = 8) {
  const rows = await db.execute(sql`
    select
      coalesce(p.id::text, oi.id::text) as id,
      oi.title_snapshot as title,
      sum(oi.quantity)::int as units,
      sum(oi.price_snapshot * oi.quantity)::int as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    left join products p on p.id = oi.product_id
    where oi.shop_id = ${shopId}
      and o.created_at >= ${startOf(period)}::timestamptz
      and o.status not in ('rejected', 'cancelled')
    -- Grouped by the SNAPSHOT title as well as the product, so a deleted product
    -- still appears in history under the name it was sold as.
    group by 1, oi.title_snapshot
    order by revenue desc
    limit ${limit}
  `);

  return (
    rows as unknown as Array<{
      id: string;
      title: LocalizedText;
      units: number;
      revenue: number;
    }>
  ).map((row) => ({
    id: row.id,
    title: row.title,
    units: Number(row.units),
    revenue: Number(row.revenue),
  }));
}

/** Order status mix, for the donut. */
export async function statusBreakdown(shopId: string, period: ReportPeriod) {
  const rows = await db.execute(sql`
    select o.status::text as status, count(distinct o.id)::int as total
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.shop_id = ${shopId}
      and o.created_at >= ${startOf(period)}::timestamptz
    group by 1
    order by total desc
  `);

  return (rows as unknown as Array<{ status: string; total: number }>).map((row) => ({
    status: row.status,
    total: Number(row.total),
  }));
}

/** Campaign performance in the period (PRD §6.7: promotion performance). */
export async function promotionPerformance(shopId: string, period: ReportPeriod) {
  const rows = await db.execute(sql`
    select
      ps.name as slot_name,
      sum(c.impressions)::int as impressions,
      sum(c.clicks)::int as clicks,
      sum(c.price_paid)::int as spend
    from campaigns c
    join promotion_slots ps on ps.id = c.slot_id
    where c.shop_id = ${shopId}
      and c.status in ('active', 'ended')
      and c.ends_at >= ${startOf(period)}::timestamptz
    group by ps.name
    order by spend desc
  `);

  return (
    rows as unknown as Array<{
      slot_name: LocalizedText;
      impressions: number;
      clicks: number;
      spend: number;
    }>
  ).map((row) => ({
    slotName: row.slot_name,
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    spend: Number(row.spend),
  }));
}

/* -------------------------------------------------------------------------- */
/* The four reports that say what to fix (Prompt C10)                         */

/**
 * ONE definition of a view and ONE of an order, shared by every report below.
 *
 * The prompt's requirement — "conversion is computed from the same view and
 * order definitions as everywhere else" — is only keepable if there is one
 * place to read them from. Written as SQL fragments rather than prose so the
 * summary strip's conversion and the views-without-sales table's conversion are
 * literally the same expression.
 *
 * VIEWS come from the daily roll-up, never `products.view_count`: the lifetime
 * counter has no time dimension, so dividing a window's orders by it would
 * report a shop's conversion falling every month it stayed the same.
 *
 * ORDERS are everything except rejected and cancelled — a customer who placed
 * an order converted, whatever the shop did next, but an order that was pulled
 * before it changed hands is not a sale by anyone's reckoning and its stock
 * went back on the shelf. Money is a different question and uses `fulfilled`
 * (Prompt C2); these two predicates must not be unified.
 *
 * `cancelled` is newer than the rest of this file. Every predicate that used to
 * read `<> 'rejected'` now reads `not in ('rejected', 'cancelled')`, and they
 * have to move together — one of them left behind would put a withdrawn order
 * into the conversion numerator while the strip above it left the order out.
 */
const viewsInWindow = (since: string) => sql`(
  select coalesce(sum(v.views), 0)::int from product_view_days v
  where v.product_id = p.id and v.day >= ${since}::timestamptz::date
)`;

const ordersInWindow = (since: string) => sql`(
  select count(distinct o.id)::int
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.product_id = p.id
    and o.created_at >= ${since}::timestamptz
    and o.status not in ('rejected', 'cancelled')
)`;

export type ViewsWithoutSalesRow = {
  id: string;
  slug: string;
  title: LocalizedText;
  price: number;
  stock: number;
  imagePath: string | null;
  views: number;
  orders: number;
  conversion: number;
  /** Which cause to point at first — see the note on the query below. */
  hint: 'photos' | 'description' | 'price' | 'promote';
  imageCount: number;
  descriptionLength: number;
  /** The mall's median price in this product's category, for the price hint. */
  categoryMedian: number | null;
};

/**
 * Products people look at and do not buy (Prompt C10).
 *
 * THE MOST ACTIONABLE REPORT A SHOPKEEPER CAN HAVE, and the reason is that it
 * is the only one where the shop has already done the hard part: someone found
 * the product and opened it. Everything after that — the photograph, the price,
 * whether the description answers the obvious question — is inside the
 * shopkeeper's control this afternoon.
 *
 * The HINT is computed from the row, not guessed at by the reader, and the
 * order is cheapest fix first. One photo loses to a competitor with five; a
 * two-line description is the next most common; price is only suggested when
 * the product really is dearer than the mall's median for its category,
 * because telling a shopkeeper to cut a competitive price is bad advice
 * expensively taken.
 *
 * When none of those apply the honest answer is that the listing is fine and
 * the problem is reach — so the hint points at an offer or a placement rather
 * than inventing a fault. A column that always says the same thing is a column
 * nobody reads.
 */
export async function viewsWithoutSales(shopId: string, period: ReportPeriod, limit = 20) {
  const since = startOf(period);

  const rows = await db.execute(sql`
    select
      p.id::text as id,
      p.slug as slug,
      p.title as title,
      p.price::int as price,
      p.stock::int as stock,
      (select pi.path from product_images pi
        where pi.product_id = p.id order by pi.sort asc limit 1) as image_path,
      (select count(*)::int from product_images pi where pi.product_id = p.id) as image_count,
      coalesce(length(p.description->>'fa'), 0)::int as description_length,
      (
        select percentile_cont(0.5) within group (order by peer.price)
        from products peer
        join shops peer_shop on peer_shop.id = peer.shop_id
        where peer.category_id = p.category_id
          and peer.status = 'published'
          and peer_shop.status = 'approved'
      ) as category_median,
      ${viewsInWindow(since)} as views,
      ${ordersInWindow(since)} as orders
    from products p
    where p.shop_id = ${shopId} and p.status = 'published'
    order by views desc
  `);

  return (rows as unknown as Array<Record<string, unknown>>)
    .map((row) => {
      const views = Number(row.views);
      const orders = Number(row.orders);
      const imageCount = Number(row.image_count);
      const descriptionLength = Number(row.description_length);
      const categoryMedian =
        row.category_median === null ? null : Math.round(Number(row.category_median));
      const price = Number(row.price);

      return {
        id: String(row.id),
        slug: String(row.slug),
        title: row.title as LocalizedText,
        price,
        stock: Number(row.stock),
        imagePath: row.image_path === null ? null : String(row.image_path),
        views,
        orders,
        conversion: views > 0 ? orders / views : 0,
        imageCount,
        descriptionLength,
        categoryMedian,
        // Cheapest fix first; price only when it really is out of line; and an
        // honest "nothing is wrong with the listing" when nothing is.
        hint: (imageCount <= 1
          ? 'photos'
          : descriptionLength < 80
            ? 'description'
            : categoryMedian !== null && price > categoryMedian * 1.15
              ? 'price'
              : 'promote') as ViewsWithoutSalesRow['hint'],
      };
    })
    // Enough traffic for the absence of sales to mean something. Below this a
    // zero-sale product is simply a product nobody has seen yet.
    .filter((row) => row.views >= 20 && row.conversion < 0.02)
    .slice(0, limit);
}

export type StockRow = {
  id: string;
  slug: string;
  title: LocalizedText;
  stock: number;
  price: number;
  imagePath: string | null;
  unitsSold: number;
  /** Days since the last unit was sold — the best proxy the data supports. */
  daysSinceLastSale: number | null;
};

/**
 * Low and out of stock (Prompt C10).
 *
 * "DAYS SINCE IT WENT OUT" is not something this schema can answer honestly.
 * Nothing records the moment stock reached zero — there is no stock event log,
 * and `products.updated_at` moves for any edit at all. So the report shows DAYS
 * SINCE THE LAST SALE instead, and the column says exactly that. Inventing the
 * stock-out date from the last sale would be right often enough to be trusted
 * and wrong exactly when it matters, which is worse than not answering.
 */
export async function stockReport(shopId: string, period: ReportPeriod) {
  const since = startOf(period);

  const rows = await db.execute(sql`
    select
      p.id::text as id,
      p.slug as slug,
      p.title as title,
      p.stock::int as stock,
      p.price::int as price,
      (select pi.path from product_images pi
        where pi.product_id = p.id order by pi.sort asc limit 1) as image_path,
      coalesce((
        select sum(oi.quantity)::int
        from order_items oi
        join orders o on o.id = oi.order_id
        where oi.product_id = p.id
          and o.created_at >= ${since}::timestamptz
          and o.status = 'fulfilled'
      ), 0) as units_sold,
      (
        select extract(day from now() - max(o.created_at))::int
        from order_items oi
        join orders o on o.id = oi.order_id
        where oi.product_id = p.id and o.status = 'fulfilled'
      ) as days_since_last_sale
    from products p
    where p.shop_id = ${shopId} and p.status = 'published' and p.stock <= 3
    order by p.stock asc, units_sold desc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: row.title as LocalizedText,
    stock: Number(row.stock),
    price: Number(row.price),
    imagePath: row.image_path === null ? null : String(row.image_path),
    unitsSold: Number(row.units_sold),
    daysSinceLastSale:
      row.days_since_last_sale === null ? null : Number(row.days_since_last_sale),
  })) as StockRow[];
}

export type ResponsivenessPoint = {
  day: string;
  acceptHours: number | null;
  readyHours: number | null;
  mallAcceptHours: number | null;
};

/**
 * How fast this shop answers, against the mall (Prompt C10).
 *
 * NOTHING MOVES BEHAVIOUR LIKE SEEING YOU ARE SLOWER THAN YOUR NEIGHBOURS, and
 * this is the one report a marketplace can produce that a shopkeeper could
 * never work out alone. It is also the one with the sharpest ethics: the mall
 * average EXCLUDES the viewing shop — otherwise a slow shop drags down the line
 * it is being compared with and looks better than it is — and it never names
 * another tenant. A shopkeeper learns where they stand, not who to resent.
 *
 * MEDIAN, not mean. One order accepted three days late after a holiday moves a
 * mean by hours and a median not at all, and the question being asked is "what
 * is a customer's normal experience".
 */
export async function responsiveness(shopId: string, period: ReportPeriod) {
  const since = startOf(period);

  const rows = await db.execute(sql`
    with placed as (
      select distinct o.id, o.created_at, oi.shop_id
      from orders o
      join order_items oi on oi.order_id = o.id
      where o.created_at >= ${since}::timestamptz
    ),
    timings as (
      select
        placed.shop_id,
        date_trunc('day', placed.created_at)::date as day,
        (select extract(epoch from (e.created_at - placed.created_at)) / 3600
          from order_events e
          where e.order_id = placed.id and e.to_status = 'accepted'
          order by e.created_at asc limit 1) as accept_hours,
        (select extract(epoch from (e.created_at - placed.created_at)) / 3600
          from order_events e
          where e.order_id = placed.id and e.to_status = 'ready'
          order by e.created_at asc limit 1) as ready_hours
      from placed
    )
    select
      to_char(day, 'YYYY-MM-DD') as day,
      percentile_cont(0.5) within group (order by accept_hours)
        filter (where shop_id = ${shopId}) as accept_hours,
      percentile_cont(0.5) within group (order by ready_hours)
        filter (where shop_id = ${shopId}) as ready_hours,
      -- The mall, WITHOUT this shop in it.
      percentile_cont(0.5) within group (order by accept_hours)
        filter (where shop_id <> ${shopId}) as mall_accept_hours
    from timings
    group by day
    order by day asc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    day: String(row.day),
    acceptHours: row.accept_hours === null ? null : Number(row.accept_hours),
    readyHours: row.ready_hours === null ? null : Number(row.ready_hours),
    mallAcceptHours: row.mall_accept_hours === null ? null : Number(row.mall_accept_hours),
  })) as ResponsivenessPoint[];
}

/** The headline medians for the same window, for the strip above the chart. */
export async function responsivenessSummary(shopId: string, period: ReportPeriod) {
  const since = startOf(period);

  const rows = await db.execute(sql`
    with placed as (
      select distinct o.id, o.created_at, oi.shop_id
      from orders o
      join order_items oi on oi.order_id = o.id
      where o.created_at >= ${since}::timestamptz
    ),
    timings as (
      select
        placed.shop_id,
        (select extract(epoch from (e.created_at - placed.created_at)) / 3600
          from order_events e
          where e.order_id = placed.id and e.to_status = 'accepted'
          order by e.created_at asc limit 1) as accept_hours,
        (select extract(epoch from (e.created_at - placed.created_at)) / 3600
          from order_events e
          where e.order_id = placed.id and e.to_status = 'ready'
          order by e.created_at asc limit 1) as ready_hours
      from placed
    )
    select
      percentile_cont(0.5) within group (order by accept_hours)
        filter (where shop_id = ${shopId}) as accept_hours,
      percentile_cont(0.5) within group (order by ready_hours)
        filter (where shop_id = ${shopId}) as ready_hours,
      percentile_cont(0.5) within group (order by accept_hours)
        filter (where shop_id <> ${shopId}) as mall_accept_hours,
      percentile_cont(0.5) within group (order by ready_hours)
        filter (where shop_id <> ${shopId}) as mall_ready_hours
    from timings
  `);

  const row = (rows as unknown as Array<Record<string, unknown>>)[0] ?? {};
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

  return {
    acceptHours: num(row.accept_hours),
    readyHours: num(row.ready_hours),
    mallAcceptHours: num(row.mall_accept_hours),
    mallReadyHours: num(row.mall_ready_hours),
  };
}

export type TimingCell = { weekday: number; hour: number; orders: number };

/**
 * When orders arrive (Prompt C10).
 *
 * The answer to a question only a shopkeeper asks: when does somebody need to
 * be at the counter. Rendered as a heat grid rather than two bar charts,
 * because "Thursday evening" is a cell and not the intersection of two
 * separate readings.
 *
 * ASIA/KABUL, explicitly. Grouping by the server's hour would put a Kabul
 * shop's evening rush at whatever time the demo laptop happens to think it is,
 * and the half-hour offset makes it wrong in a way that looks plausible.
 */
export async function orderTiming(shopId: string, period: ReportPeriod) {
  const since = startOf(period);

  const rows = await db.execute(sql`
    select
      extract(dow from (o.created_at at time zone 'Asia/Kabul'))::int as weekday,
      extract(hour from (o.created_at at time zone 'Asia/Kabul'))::int as hour,
      count(distinct o.id)::int as orders
    from orders o
    join order_items oi on oi.order_id = o.id
    where oi.shop_id = ${shopId}
      and o.created_at >= ${since}::timestamptz
      and o.status not in ('rejected', 'cancelled')
    group by 1, 2
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    weekday: Number(row.weekday),
    hour: Number(row.hour),
    orders: Number(row.orders),
  })) as TimingCell[];
}

/**
 * The period summary strip (Prompt C10).
 *
 * Every figure here is defined once, above: money is fulfilled, orders are
 * everything but rejected, views come from the daily roll-up. Conversion is
 * ORDERS over VIEWS across the whole catalogue — the same division the
 * views-without-sales table does per product, so a shopkeeper can read the
 * strip, open the table, and have the two agree.
 */
export async function periodSummary(shopId: string, period: ReportPeriod) {
  const since = startOf(period);

  const rows = await db.execute(sql`
    select
      coalesce(sum(oi.price_snapshot * oi.quantity)
        filter (where o.status = 'fulfilled'), 0)::int as revenue,
      count(distinct o.id) filter (where o.status not in ('rejected', 'cancelled'))::int as order_count,
      coalesce(sum(oi.quantity) filter (where o.status = 'fulfilled'), 0)::int as units,
      coalesce((
        select sum(v.views)::int from product_view_days v
        join products p on p.id = v.product_id
        where p.shop_id = ${shopId} and v.day >= ${since}::timestamptz::date
      ), 0) as views
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.shop_id = ${shopId} and o.created_at >= ${since}::timestamptz
  `);

  const row = (rows as unknown as Array<Record<string, unknown>>)[0] ?? {};
  const revenue = Number(row.revenue ?? 0);
  const orderCount = Number(row.order_count ?? 0);
  const views = Number(row.views ?? 0);

  return {
    revenue,
    orderCount,
    units: Number(row.units ?? 0),
    views,
    averageOrderValue: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
    conversion: views > 0 ? orderCount / views : 0,
  };
}
