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
        and o.status <> 'rejected'
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
        and o.status <> 'rejected'
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
      and o.status <> 'rejected'
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
