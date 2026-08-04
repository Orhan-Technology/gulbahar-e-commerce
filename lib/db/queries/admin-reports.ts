import { sql } from 'drizzle-orm';

import { db } from '..';
import type { LocalizedText } from '../schema/shared';

/**
 * Platform reporting (PRD §7.4).
 *
 * The shopkeeper's reports answer "how is my shop doing"; these answer "how is the
 * marketplace doing", which is a different question with two consequences:
 *
 *   - GMV counts what CUSTOMERS paid — orders.total, including delivery — not the
 *     sum of shop subtotals. Attribution by shop belongs in the top-shops table,
 *     where a multi-shop order is split correctly through order_items.
 *   - Money is FULFILLED orders only, everywhere, and the predicate is applied
 *     per COLUMN rather than per query so a revenue figure and an order count
 *     can sit in one row without agreeing about what counts (Prompt C2).
 *     Rejected orders stay INCLUDED in the status mix, since a rejection rate
 *     is exactly the kind of thing platform reporting exists to surface.
 *
 * `days` rather than a Date, so the clock is read here and not during render
 * (React 19 purity). Aggregates are cast — see queries/fragments.ts.
 */

export type PlatformPeriod = 7 | 30 | 90;

function since(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * A signed fraction, or null when there is nothing to divide by.
 *
 * NULL RATHER THAN −100% OR Infinity, everywhere in this product: a delta
 * against a zero baseline is not "down a hundred percent", it is a comparison
 * that was never made, and the tiles say so in words instead (StatCard, and
 * `revenueMonthToDate` for the same rule).
 */
function delta(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

/**
 * Platform totals for the window AND the equally-long stretch before it
 * (Prompt C12).
 *
 * WHY THE COMPARISON IS BUILT HERE. «۱٬۶۷۳٬۷۳۰ ؋» is a number. «۱٬۶۷۳٬۷۳۰ ؋ —
 * ۱۲٪ بیشتر از ۳۰ روز پیش» is a sentence a mall director can say out loud in a
 * meeting, and that difference is the entire job of a reporting screen. The
 * baseline is derived from the window rather than configured separately, which
 * is the rule lib/console-range.ts exists to enforce: a value and its delta
 * come from one place or they eventually disagree.
 *
 * ONE QUERY, TWO WINDOWS, using `filter` per column — the same discipline the
 * rest of this module uses so a revenue figure and an order count in one row
 * cannot end up disagreeing about what counts.
 */
export async function platformTotals(days: PlatformPeriod) {
  const rows = await db.execute(sql`
    select
      coalesce(sum(o.total) filter (
        where o.status = 'fulfilled' and o.created_at >= ${since(days)}::timestamptz
      ), 0)::int as gmv,
      count(*) filter (
        where o.status not in ('rejected', 'cancelled')
          and o.created_at >= ${since(days)}::timestamptz
      )::int as order_count,
      count(*) filter (
        where o.status = 'fulfilled' and o.created_at >= ${since(days)}::timestamptz
      )::int as fulfilled_count,
      count(*) filter (
        where o.status = 'rejected' and o.created_at >= ${since(days)}::timestamptz
      )::int as rejected_count,
      count(distinct o.user_id) filter (
        where o.created_at >= ${since(days)}::timestamptz
      )::int as buyers,
      coalesce(round(avg(o.total) filter (
        where o.status = 'fulfilled' and o.created_at >= ${since(days)}::timestamptz
      ))::int, 0) as average_order_value,

      -- The previous window: same length, immediately before, exclusive of the
      -- current one so a single order can never be counted in both.
      coalesce(sum(o.total) filter (
        where o.status = 'fulfilled'
          and o.created_at >= ${since(days * 2)}::timestamptz
          and o.created_at < ${since(days)}::timestamptz
      ), 0)::int as previous_gmv,
      count(*) filter (
        where o.status not in ('rejected', 'cancelled')
          and o.created_at >= ${since(days * 2)}::timestamptz
          and o.created_at < ${since(days)}::timestamptz
      )::int as previous_order_count,
      count(distinct o.user_id) filter (
        where o.created_at >= ${since(days * 2)}::timestamptz
          and o.created_at < ${since(days)}::timestamptz
      )::int as previous_buyers,
      coalesce(round(avg(o.total) filter (
        where o.status = 'fulfilled'
          and o.created_at >= ${since(days * 2)}::timestamptz
          and o.created_at < ${since(days)}::timestamptz
      ))::int, 0) as previous_average_order_value
    from orders o
    where o.created_at >= ${since(days * 2)}::timestamptz
  `);

  const [row] = rows as unknown as Array<Record<string, number>>;
  const gmv = Number(row?.gmv ?? 0);
  const orderCount = Number(row?.order_count ?? 0);
  const buyers = Number(row?.buyers ?? 0);
  const averageOrderValue = Number(row?.average_order_value ?? 0);

  const previousGmv = Number(row?.previous_gmv ?? 0);
  const previousOrderCount = Number(row?.previous_order_count ?? 0);
  const previousBuyers = Number(row?.previous_buyers ?? 0);
  const previousAverageOrderValue = Number(row?.previous_average_order_value ?? 0);

  return {
    gmv,
    orderCount,
    fulfilledCount: Number(row?.fulfilled_count ?? 0),
    rejectedCount: Number(row?.rejected_count ?? 0),
    buyers,
    averageOrderValue,
    previous: {
      gmv: previousGmv,
      orderCount: previousOrderCount,
      buyers: previousBuyers,
      averageOrderValue: previousAverageOrderValue,
    },
    delta: {
      gmv: delta(gmv, previousGmv),
      orderCount: delta(orderCount, previousOrderCount),
      buyers: delta(buyers, previousBuyers),
      averageOrderValue: delta(averageOrderValue, previousAverageOrderValue),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The owners' monthly report (Prompt C12)                                    */

/**
 * The same totals, over an ARBITRARY window rather than 7/30/90 days.
 *
 * WHY A SECOND FUNCTION. `platformTotals` is deliberately typed to the three
 * console ranges, which is what stops a fourth window being invented without
 * the report queries being taught about it. A calendar month is not one of
 * those ranges and never can be — it is 29, 30 or 31 days depending on which
 * solar month the reader is in (lib/locale-month.ts) — so it gets bounds
 * instead of a day count, and the SAME per-column predicates so the two agree
 * about what "GMV" means.
 *
 * `.toISOString()` with an explicit `::timestamptz`: a JS Date interpolated
 * into a raw fragment has no column to infer a type from (CLAUDE.md).
 */
export async function platformTotalsBetween(bounds: {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}) {
  const start = sql`${bounds.start.toISOString()}::timestamptz`;
  const end = sql`${bounds.end.toISOString()}::timestamptz`;
  const prevStart = sql`${bounds.previousStart.toISOString()}::timestamptz`;
  const prevEnd = sql`${bounds.previousEnd.toISOString()}::timestamptz`;

  const rows = await db.execute(sql`
    select
      coalesce(sum(o.total) filter (
        where o.status = 'fulfilled' and o.created_at >= ${start} and o.created_at < ${end}
      ), 0)::int as gmv,
      count(*) filter (
        where o.status not in ('rejected', 'cancelled')
          and o.created_at >= ${start} and o.created_at < ${end}
      )::int as order_count,
      count(distinct o.user_id) filter (
        where o.created_at >= ${start} and o.created_at < ${end}
      )::int as buyers,
      coalesce(sum(o.total) filter (
        where o.status = 'fulfilled'
          and o.created_at >= ${prevStart} and o.created_at < ${prevEnd}
      ), 0)::int as previous_gmv,
      count(*) filter (
        where o.status not in ('rejected', 'cancelled')
          and o.created_at >= ${prevStart} and o.created_at < ${prevEnd}
      )::int as previous_order_count
    from orders o
    where o.created_at >= ${prevStart} and o.created_at < ${end}
  `);

  const [row] = rows as unknown as Array<Record<string, number>>;
  const gmv = Number(row?.gmv ?? 0);
  const orderCount = Number(row?.order_count ?? 0);
  const previousGmv = Number(row?.previous_gmv ?? 0);
  const previousOrderCount = Number(row?.previous_order_count ?? 0);

  return {
    gmv,
    orderCount,
    buyers: Number(row?.buyers ?? 0),
    previousGmv,
    previousOrderCount,
    gmvDelta: delta(gmv, previousGmv),
    orderDelta: delta(orderCount, previousOrderCount),
  };
}

/** Top shops over an arbitrary window — the monthly report's leaderboard. */
export async function topShopsBetween(start: Date, end: Date, limit = 5) {
  const rows = await db.execute(sql`
    select
      s.id::text as id,
      s.slug as slug,
      s.name as name,
      coalesce(sum(oi.price_snapshot * oi.quantity)
        filter (where o.status = 'fulfilled'), 0)::int as revenue,
      count(distinct o.id) filter (where o.status not in ('rejected', 'cancelled'))::int as order_count
    from order_items oi
    join orders o on o.id = oi.order_id
    join shops s on s.id = oi.shop_id
    where o.created_at >= ${start.toISOString()}::timestamptz
      and o.created_at < ${end.toISOString()}::timestamptz
    group by s.id, s.slug, s.name
    order by revenue desc
    limit ${limit}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: row.name as LocalizedText,
    revenue: Number(row.revenue),
    orderCount: Number(row.order_count),
  }));
}

/** Daily GMV and order volume, zero-filled so the chart has no gaps. */
export async function platformSeries(days: PlatformPeriod) {
  const rows = await db.execute(sql`
    with span as (
      select generate_series((${since(days)}::timestamptz)::date, current_date, interval '1 day')::date as day
    ),
    totals as (
      select o.created_at::date as day,
             sum(o.total) filter (where o.status = 'fulfilled')::int as gmv,
             count(*) filter (where o.status not in ('rejected', 'cancelled'))::int as order_count
      from orders o
      where o.created_at >= ${since(days)}::timestamptz
      group by 1
    )
    select span.day::text as day,
           coalesce(totals.gmv, 0)::int as gmv,
           coalesce(totals.order_count, 0)::int as order_count
    from span left join totals on totals.day = span.day
    order by span.day asc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    day: String(row.day),
    revenue: Number(row.gmv),
    orderCount: Number(row.order_count),
  }));
}

export async function platformStatusMix(days: PlatformPeriod) {
  const rows = await db.execute(sql`
    select o.status::text as status, count(*)::int as total
    from orders o
    where o.created_at >= ${since(days)}::timestamptz
    group by 1 order by total desc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    status: String(row.status),
    total: Number(row.total),
  }));
}

/**
 * Top shops by the revenue THEY earned.
 *
 * Through order_items, so a two-shop basket is split between them rather than
 * credited twice — the mistake that would make the column sum to more than GMV.
 */
export async function topShops(days: PlatformPeriod, limit = 8) {
  const rows = await db.execute(sql`
    select
      s.id::text as id,
      s.slug as slug,
      s.name as name,
      -- ONE PREDICATE PER METRIC (Prompt C2), applied per column rather than
      -- to the whole query: revenue is FULFILLED money, order_count is business
      -- received. Sharing one status test between them made this column sum to
      -- more than the GMV tile above it, which is the drift C2 exists to stop.
      -- "Business received" excludes cancelled as well as rejected: an order
      -- withdrawn before it changed hands is not business the shop received,
      -- and its stock went back on the shelf.
      coalesce(sum(oi.price_snapshot * oi.quantity)
        filter (where o.status = 'fulfilled'), 0)::int as revenue,
      count(distinct o.id) filter (where o.status not in ('rejected', 'cancelled'))::int as order_count
    from order_items oi
    join orders o on o.id = oi.order_id
    join shops s on s.id = oi.shop_id
    where o.created_at >= ${since(days)}::timestamptz
    group by s.id, s.slug, s.name
    order by revenue desc
    limit ${limit}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: row.name as LocalizedText,
    revenue: Number(row.revenue),
    orderCount: Number(row.order_count),
  }));
}

/** Top categories, rolled up to the ROOT so the list is readable. */
export async function topCategories(days: PlatformPeriod, limit = 8) {
  const rows = await db.execute(sql`
    select
      coalesce(root.id, leaf.id)::text as id,
      coalesce(root.name, leaf.name) as name,
      coalesce(sum(oi.price_snapshot * oi.quantity)
        filter (where o.status = 'fulfilled'), 0)::int as revenue,
      coalesce(sum(oi.quantity) filter (where o.status = 'fulfilled'), 0)::int as units
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    join categories leaf on leaf.id = p.category_id
    -- A product sits on a leaf; managers think in top-level categories.
    left join categories root on root.id = leaf.parent_id
    where o.created_at >= ${since(days)}::timestamptz
    group by 1, 2
    order by revenue desc
    limit ${limit}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: row.name as LocalizedText,
    revenue: Number(row.revenue),
    units: Number(row.units),
  }));
}

/** Shops that took an order in the window — activity, not merely approval. */
export async function activeShopCount(days: PlatformPeriod) {
  const rows = await db.execute(sql`
    select
      (select count(*)::int from shops where status = 'approved') as approved,
      (
        select count(distinct oi.shop_id)::int
        from order_items oi join orders o on o.id = oi.order_id
        where o.created_at >= ${since(days)}::timestamptz
      ) as trading,
      -- The same measure one window back, so "13 shops trading" can say whether
      -- that is more or fewer than last month (Prompt C12).
      (
        select count(distinct oi.shop_id)::int
        from order_items oi join orders o on o.id = oi.order_id
        where o.created_at >= ${since(days * 2)}::timestamptz
          and o.created_at < ${since(days)}::timestamptz
      ) as previous_trading
  `);

  const [row] = rows as unknown as Array<Record<string, number>>;
  const trading = Number(row?.trading ?? 0);
  const previousTrading = Number(row?.previous_trading ?? 0);

  return {
    approved: Number(row?.approved ?? 0),
    trading,
    previousTrading,
    tradingDelta: delta(trading, previousTrading),
  };
}
