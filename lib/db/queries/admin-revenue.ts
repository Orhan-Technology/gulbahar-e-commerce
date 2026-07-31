import { sql } from 'drizzle-orm';

import { db } from '..';
import type { LocalizedText } from '../schema/shared';

/**
 * Paid-placement revenue and slot inventory, admin side (PRD §7.3).
 *
 * This is the data behind quality-bar screen #4 — the "this is your new income"
 * moment (PRD §10.8) — so the numbers have to be defensible, not merely large.
 * Three rules apply throughout:
 *
 *   - Revenue is `campaigns.price_paid`, the amount snapshotted when the booking
 *     was made. Multiplying today's slot rate by a past duration would rewrite
 *     history every time pricing changed.
 *   - Only campaigns that were actually SOLD count: approved, active and ended.
 *     A requested booking is a hope, and a rejected one is nothing.
 *   - Every aggregate is cast (::int / ::float8), because count() and sum() arrive
 *     as strings through postgres.js (see queries/fragments.ts).
 *
 * Written as raw SQL: these are date-series aggregates with occupancy arithmetic,
 * and the SQL reads far more clearly than the builder equivalent.
 */

const SOLD = sql`c.status in ('approved', 'active', 'ended')`;

/** Headline totals. `activeRevenue` is what is running right now, not lifetime. */
export async function revenueTotals() {
  const rows = await db.execute(sql`
    select
      coalesce(sum(c.price_paid) filter (where ${SOLD}), 0)::int as total,
      coalesce(sum(c.price_paid) filter (where c.status = 'active'), 0)::int as active_revenue,
      count(*) filter (where c.status = 'active')::int as active_count,
      count(*) filter (where c.status = 'requested')::int as requested_count,
      count(distinct c.shop_id) filter (where ${SOLD})::int as paying_shops,
      coalesce(sum(c.impressions) filter (where ${SOLD}), 0)::int as impressions,
      coalesce(sum(c.clicks) filter (where ${SOLD}), 0)::int as clicks
    from campaigns c
  `);

  const [row] = rows as unknown as Array<Record<string, number>>;
  return {
    total: Number(row?.total ?? 0),
    activeRevenue: Number(row?.active_revenue ?? 0),
    activeCount: Number(row?.active_count ?? 0),
    requestedCount: Number(row?.requested_count ?? 0),
    payingShops: Number(row?.paying_shops ?? 0),
    impressions: Number(row?.impressions ?? 0),
    clicks: Number(row?.clicks ?? 0),
  };
}

/**
 * Revenue per slot type, with occupancy.
 *
 * Occupancy is what turns this from a bar chart into a pricing decision: a slot at
 * 100% occupancy is underpriced, one at 20% is overpriced or unattractive. Measured
 * as concurrent bookings against capacity RIGHT NOW, which is the number a manager
 * can act on today.
 */
export async function revenueBySlot() {
  const rows = await db.execute(sql`
    select
      ps.id::text as id,
      ps.key::text as key,
      ps.name as name,
      ps.capacity::int as capacity,
      ps.price_per_week::int as price_per_week,
      coalesce(sum(c.price_paid) filter (where ${SOLD}), 0)::int as revenue,
      coalesce(
        sum(c.price_paid) filter (where ${SOLD} and c.starts_at >= date_trunc('month', now())),
        0
      )::int as month_revenue,
      count(*) filter (where ${SOLD})::int as campaign_count,
      count(*) filter (
        where c.status in ('approved', 'active') and c.starts_at <= now() and c.ends_at >= now()
      )::int as occupied,
      -- Who is IN the slot right now. Aggregated in a subquery rather than
      -- against the outer join, which would repeat a shop once per campaign it
      -- has ever run in this slot.
      (
        select coalesce(json_agg(s.name order by running.starts_at), '[]'::json)
        from campaigns running
        join shops s on s.id = running.shop_id
        where running.slot_id = ps.id
          and running.status in ('approved', 'active')
          and running.starts_at <= now()
          and running.ends_at >= now()
      ) as current_shops,
      coalesce(sum(c.impressions) filter (where ${SOLD}), 0)::int as impressions,
      coalesce(sum(c.clicks) filter (where ${SOLD}), 0)::int as clicks
    from promotion_slots ps
    left join campaigns c on c.slot_id = ps.id
    group by ps.id, ps.key, ps.name, ps.capacity, ps.price_per_week
    order by revenue desc, ps.price_per_week desc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => {
    const capacity = Number(row.capacity);
    const occupied = Number(row.occupied);
    return {
      id: String(row.id),
      key: String(row.key),
      name: row.name as LocalizedText,
      capacity,
      pricePerWeek: Number(row.price_per_week),
      revenue: Number(row.revenue),
      monthRevenue: Number(row.month_revenue),
      campaignCount: Number(row.campaign_count),
      occupied,
      currentShops: (row.current_shops ?? []) as LocalizedText[],
      // Clamped: an oversold slot would otherwise render a bar past 100%.
      occupancy: capacity > 0 ? Math.min(occupied / capacity, 1) : 0,
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
    };
  });
}

/**
 * Monthly revenue from the seeded history (PRD §7.3).
 *
 * Attributed to the month a campaign STARTS, not spread across its run. A weekly
 * flat fee is invoiced up front (PRD §8.3), so start-month is when the money
 * arrives; pro-rating it would show revenue the mall has not billed.
 */
export async function revenueByMonth(months = 6) {
  const rows = await db.execute(sql`
    with series as (
      select date_trunc('month', now()) - (interval '1 month' * gs) as month
      from generate_series(0, ${months - 1}) as gs
    ),
    sold as (
      select date_trunc('month', c.starts_at) as month,
             sum(c.price_paid)::int as revenue,
             count(*)::int as campaign_count
      from campaigns c
      where ${SOLD}
      group by 1
    )
    select
      to_char(series.month, 'YYYY-MM-DD') as month,
      coalesce(sold.revenue, 0)::int as revenue,
      coalesce(sold.campaign_count, 0)::int as campaign_count
    from series
    left join sold on sold.month = series.month
    order by series.month asc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    month: String(row.month),
    revenue: Number(row.revenue),
    campaignCount: Number(row.campaign_count),
  }));
}

/** Every campaign with its shop, slot, window and price — the revenue table. */
export async function campaignLedger(
  status?: 'requested' | 'approved' | 'active' | 'rejected' | 'ended',
) {
  const rows = await db.execute(sql`
    select
      c.id::text as id,
      c.status::text as status,
      c.starts_at as starts_at,
      c.ends_at as ends_at,
      c.price_paid::int as price_paid,
      c.impressions::int as impressions,
      c.clicks::int as clicks,
      c.rejection_reason as rejection_reason,
      s.id::text as shop_id,
      s.slug as shop_slug,
      s.name as shop_name,
      ps.name as slot_name,
      ps.key::text as slot_key,
      p.title as product_title,
      p.slug as product_slug,
      -- Whole weeks, so the table can show what was bought as well as paid.
      greatest(1, round(extract(epoch from (c.ends_at - c.starts_at)) / 604800))::int as weeks
    from campaigns c
    join shops s on s.id = c.shop_id
    join promotion_slots ps on ps.id = c.slot_id
    left join products p on p.id = c.product_id
    ${status ? sql`where c.status = ${status}` : sql``}
    order by
      -- Requests first: they are the only rows that need an action.
      case c.status when 'requested' then 0 when 'active' then 1 else 2 end,
      c.starts_at desc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    status: String(row.status) as 'requested' | 'approved' | 'active' | 'rejected' | 'ended',
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    pricePaid: Number(row.price_paid),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    rejectionReason: row.rejection_reason as string | null,
    shopId: String(row.shop_id),
    shopSlug: String(row.shop_slug),
    shopName: row.shop_name as LocalizedText,
    slotName: row.slot_name as LocalizedText,
    slotKey: String(row.slot_key),
    productTitle: (row.product_title ?? null) as LocalizedText | null,
    productSlug: (row.product_slug ?? null) as string | null,
    weeks: Number(row.weeks),
  }));
}

/**
 * Booking calendar: for each slot, how many of its places are taken in each of the
 * next `weeks` weeks (PRD §7.3).
 *
 * Weeks are generated in SQL from the current week start, so "week 1" means the
 * same thing to every row and there is no timezone arithmetic in JavaScript.
 */
export async function bookingCalendar(weeks = 8) {
  const rows = await db.execute(sql`
    with weeks as (
      select
        date_trunc('week', now()) + (interval '1 week' * gs) as week_start,
        date_trunc('week', now()) + (interval '1 week' * (gs + 1)) - interval '1 second' as week_end
      from generate_series(0, ${weeks - 1}) as gs
    )
    select
      ps.id::text as slot_id,
      ps.key::text as slot_key,
      ps.name as slot_name,
      ps.capacity::int as capacity,
      to_char(weeks.week_start, 'YYYY-MM-DD') as week_start,
      (
        select count(*)::int from campaigns c
        where c.slot_id = ps.id
          and c.status in ('approved', 'active')
          -- Overlap, not containment: a campaign spanning the week occupies it.
          and c.starts_at <= weeks.week_end
          and c.ends_at >= weeks.week_start
      ) as booked
    from promotion_slots ps
    cross join weeks
    order by ps.price_per_week desc, weeks.week_start asc
  `);

  const flat = (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    slotId: String(row.slot_id),
    slotKey: String(row.slot_key),
    slotName: row.slot_name as LocalizedText,
    capacity: Number(row.capacity),
    weekStart: String(row.week_start),
    booked: Number(row.booked),
  }));

  // Grouped per slot, so the UI renders one row of week cells per slot.
  const bySlot = new Map<
    string,
    {
      slotId: string;
      slotKey: string;
      slotName: LocalizedText;
      capacity: number;
      weeks: Array<{ weekStart: string; booked: number }>;
    }
  >();
  for (const cell of flat) {
    const existing = bySlot.get(cell.slotId);
    if (existing) existing.weeks.push({ weekStart: cell.weekStart, booked: cell.booked });
    else
      bySlot.set(cell.slotId, {
        slotId: cell.slotId,
        slotKey: cell.slotKey,
        slotName: cell.slotName,
        capacity: cell.capacity,
        weeks: [{ weekStart: cell.weekStart, booked: cell.booked }],
      });
  }

  return [...bySlot.values()];
}

/** Top shops by placement spend — who the mall's advertising customers are. */
export async function topPayingShops(limit = 6) {
  const rows = await db.execute(sql`
    select
      s.id::text as id,
      s.slug as slug,
      s.name as name,
      sum(c.price_paid)::int as spend,
      count(*)::int as campaign_count
    from campaigns c
    join shops s on s.id = c.shop_id
    where ${SOLD}
    group by s.id, s.slug, s.name
    order by spend desc
    limit ${limit}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: row.name as LocalizedText,
    spend: Number(row.spend),
    campaignCount: Number(row.campaign_count),
  }));
}

/* -------------------------------------------------------------------------- */
/* The slot calendar (Prompt C9)                                              */

export type SlotDay = {
  /** YYYY-MM-DD. */
  day: string;
  booked: number;
};

export type SlotMonthRow = {
  slotId: string;
  slotKey: string;
  slotName: LocalizedText;
  capacity: number;
  pricePerWeek: number;
  days: SlotDay[];
  /** Slot-days with nothing in them — the unsold inventory, in one number. */
  vacantDays: number;
};

export type MonthBooking = {
  id: string;
  slotId: string;
  slotKey: string;
  slotName: LocalizedText;
  shopId: string;
  shopName: LocalizedText;
  status: string;
  startsAt: Date;
  endsAt: Date;
  pricePaid: number;
};

/**
 * A month of placement inventory, slot by slot and day by day (Prompt C9).
 *
 * WHY A CALENDAR AND NOT A TOTAL. The revenue page already answers "what did
 * placements earn"; nobody could answer "what is still for sale in October",
 * which is the question that turns this from a report into a sales tool. An
 * empty cell here is money the mall has not asked anyone for yet.
 *
 * The BOUNDS ARE PASSED IN, from lib/locale-month.ts — the caller knows which
 * calendar the reader uses, and a Gregorian month hard-coded here would put the
 * grid a fortnight away from the Dari header above it.
 *
 * DAY GRANULARITY, not weekly. Campaigns are sold by the week but they do not
 * start on Mondays — a booking running the 12th to the 26th leaves the first
 * eleven days of the month sellable, and a weekly grid would paint that whole
 * first week as occupied and hide the gap.
 *
 * Only SOLD campaigns occupy a cell: approved and active. A requested booking
 * is a hope, and colouring the calendar with hopes would oversell the slot the
 * moment two shops ask for the same week.
 */
export async function slotMonth(start: Date, end: Date) {

  const rows = await db.execute(sql`
    with days as (
      select generate_series(
        ${start.toISOString()}::timestamptz,
        ${end.toISOString()}::timestamptz - interval '1 day',
        interval '1 day'
      ) as day
    )
    select
      ps.id::text as slot_id,
      ps.key::text as slot_key,
      ps.name as slot_name,
      ps.capacity::int as capacity,
      ps.price_per_week::int as price_per_week,
      to_char(days.day, 'YYYY-MM-DD') as day,
      (
        select count(*)::int from campaigns c
        where c.slot_id = ps.id
          and c.status in ('approved', 'active')
          -- Overlap, not containment: a campaign spanning the day occupies it.
          and c.starts_at < days.day + interval '1 day'
          and c.ends_at >= days.day
      ) as booked
    from promotion_slots ps
    cross join days
    order by ps.price_per_week desc, days.day asc
  `);

  const bySlot = new Map<string, SlotMonthRow>();
  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    const slotId = String(row.slot_id);
    const entry = bySlot.get(slotId) ?? {
      slotId,
      slotKey: String(row.slot_key),
      slotName: row.slot_name as LocalizedText,
      capacity: Number(row.capacity),
      pricePerWeek: Number(row.price_per_week),
      days: [],
      vacantDays: 0,
    };

    const booked = Number(row.booked);
    entry.days.push({ day: String(row.day), booked });
    if (booked === 0) entry.vacantDays += 1;
    bySlot.set(slotId, entry);
  }

  return [...bySlot.values()];
}

/** Every booking touching the month, for the list under the grid. */
export async function monthBookings(start: Date, end: Date): Promise<MonthBooking[]> {

  const rows = await db.execute(sql`
    select
      c.id::text as id,
      c.slot_id::text as slot_id,
      ps.key::text as slot_key,
      ps.name as slot_name,
      s.id::text as shop_id,
      s.name as shop_name,
      c.status::text as status,
      c.starts_at as starts_at,
      c.ends_at as ends_at,
      c.price_paid::int as price_paid
    from campaigns c
    join promotion_slots ps on ps.id = c.slot_id
    join shops s on s.id = c.shop_id
    where c.starts_at < ${end.toISOString()}::timestamptz
      and c.ends_at >= ${start.toISOString()}::timestamptz
      -- Requested bookings ARE listed, unlike in the grid: a pending request is
      -- exactly what an admin opened this page to decide.
      and c.status in ('requested', 'approved', 'active')
    order by c.starts_at asc
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    slotId: String(row.slot_id),
    slotKey: String(row.slot_key),
    slotName: row.slot_name as LocalizedText,
    shopId: String(row.shop_id),
    shopName: row.shop_name as LocalizedText,
    status: String(row.status),
    startsAt: new Date(String(row.starts_at)),
    endsAt: new Date(String(row.ends_at)),
    pricePaid: Number(row.price_paid),
  }));
}
