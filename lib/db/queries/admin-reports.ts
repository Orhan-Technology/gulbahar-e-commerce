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

export async function platformTotals(days: PlatformPeriod) {
  const rows = await db.execute(sql`
    select
      coalesce(sum(o.total) filter (where o.status = 'fulfilled'), 0)::int as gmv,
      count(*) filter (where o.status <> 'rejected')::int as order_count,
      count(*) filter (where o.status = 'fulfilled')::int as fulfilled_count,
      count(*) filter (where o.status = 'rejected')::int as rejected_count,
      count(distinct o.user_id)::int as buyers,
      coalesce(round(avg(o.total) filter (where o.status = 'fulfilled'))::int, 0) as average_order_value
    from orders o
    where o.created_at >= ${since(days)}::timestamptz
  `);

  const [row] = rows as unknown as Array<Record<string, number>>;
  return {
    gmv: Number(row?.gmv ?? 0),
    orderCount: Number(row?.order_count ?? 0),
    fulfilledCount: Number(row?.fulfilled_count ?? 0),
    rejectedCount: Number(row?.rejected_count ?? 0),
    buyers: Number(row?.buyers ?? 0),
    averageOrderValue: Number(row?.average_order_value ?? 0),
  };
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
             count(*) filter (where o.status <> 'rejected')::int as order_count
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
      -- received. Sharing one <> 'rejected' between them made this column sum to
      -- more than the GMV tile above it, which is the drift C2 exists to stop.
      coalesce(sum(oi.price_snapshot * oi.quantity)
        filter (where o.status = 'fulfilled'), 0)::int as revenue,
      count(distinct o.id) filter (where o.status <> 'rejected')::int as order_count
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
      ) as trading
  `);

  const [row] = rows as unknown as Array<Record<string, number>>;
  return { approved: Number(row?.approved ?? 0), trading: Number(row?.trading ?? 0) };
}
