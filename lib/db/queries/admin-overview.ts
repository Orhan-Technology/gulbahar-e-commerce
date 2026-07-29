import { sql } from 'drizzle-orm';

import { db } from '..';
import { pickLocale } from '../localized';
import type { LocalizedText } from '../schema/shared';

/**
 * The admin overview's own reads (PRD §7).
 *
 * Everything here exists because the overview asks a question no section page
 * asks: not "list the pending shops" or "list the requested campaigns" but
 * "what, across the whole platform, is waiting on ME" — one queue, ordered by
 * urgency, mixing four different tables.
 *
 * Kept out of queries/admin.ts, which is the shape the SECTION pages read
 * through. This module composes; that one filters.
 */

/**
 * An order sitting at `placed` for longer than this has stopped being a new
 * order and become a problem: the customer is waiting, and the shop has not
 * looked. Two days is the point at which the mall, not the shop, owns it.
 */
const STALE_ORDER_HOURS = 48;

export type AdminQueueEntry = {
  kind: 'pending_shop' | 'requested_campaign' | 'reported_review' | 'stale_order';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  at: Date;
  /** Initial for the monogram tile; empty when the row is not about a shop. */
  monogram: string;
};

/**
 * Everything awaiting an administrator's decision, as ROWS rather than counts
 * (PRD §7.1, §7.2, §7.3).
 *
 * Ordered pending shops → campaigns → reported reviews → stale orders, which is
 * money and reputation first: a shop that cannot open is losing every day it
 * waits, and a campaign that cannot start is revenue the mall has not billed.
 * Reported reviews and stale orders are real work but nobody is blocked on them
 * in the same way.
 */
export async function adminActionQueue(locale: string): Promise<AdminQueueEntry[]> {
  const [shopRows, campaignRows, reviewRows, orderRows] = await Promise.all([
    db.execute(sql`
      select s.id::text as id, s.slug, s.name, s.created_at,
             c.name as category_name
      from shops s
      left join categories c on c.id = s.category_id
      where s.status = 'pending'
      order by s.created_at asc
      limit 8
    `),
    db.execute(sql`
      select c.id::text as id, c.price_paid, c.starts_at, c.ends_at, c.created_at,
             s.name as shop_name, ps.name as slot_name
      from campaigns c
      join shops s on s.id = c.shop_id
      join promotion_slots ps on ps.id = c.slot_id
      where c.status = 'requested'
      order by c.created_at asc
      limit 8
    `),
    db.execute(sql`
      select r.id::text as id, r.rating, r.created_at, p.title as product_title, sh.name as shop_name
      from reviews r
      join products p on p.id = r.product_id
      join shops sh on sh.id = p.shop_id
      where r.status = 'reported'
      order by r.created_at asc
      limit 6
    `),
    /*
     * Stale orders, counted from when the customer placed them. `status =
     * 'placed'` is the whole predicate: accepted-but-not-ready is the shop
     * working, which is not the mall's business.
     */
    db.execute(sql`
      select o.id::text as id, o.reference, o.created_at, o.total,
             (select s.name from order_items oi join shops s on s.id = oi.shop_id
              where oi.order_id = o.id limit 1) as shop_name
      from orders o
      where o.status = 'placed'
        and o.created_at < now() - (${STALE_ORDER_HOURS} * interval '1 hour')
      order by o.created_at asc
      limit 6
    `),
  ]);

  const shops = shopRows as unknown as Array<{
    id: string;
    slug: string;
    name: LocalizedText;
    created_at: string;
    category_name: LocalizedText | null;
  }>;
  const campaigns = campaignRows as unknown as Array<{
    id: string;
    price_paid: number;
    starts_at: string;
    ends_at: string;
    created_at: string;
    shop_name: LocalizedText;
    slot_name: LocalizedText;
  }>;
  const reviews = reviewRows as unknown as Array<{
    id: string;
    rating: number;
    created_at: string;
    product_title: LocalizedText;
    shop_name: LocalizedText;
  }>;
  const orders = orderRows as unknown as Array<{
    id: string;
    reference: string;
    created_at: string;
    total: number;
    shop_name: LocalizedText | null;
  }>;

  const initial = (name: LocalizedText) => pickLocale(name, locale).trim().charAt(0);

  return [
    ...shops.map((row): AdminQueueEntry => ({
      kind: 'pending_shop',
      id: row.id,
      title: pickLocale(row.name, locale),
      // The category is the one fact that tells an approver what they are
      // approving without opening it.
      subtitle: row.category_name ? pickLocale(row.category_name, locale) : '',
      href: `/admin/shops/${row.slug}`,
      at: new Date(row.created_at),
      monogram: initial(row.name),
    })),
    ...campaigns.map((row): AdminQueueEntry => ({
      kind: 'requested_campaign',
      id: row.id,
      title: pickLocale(row.shop_name, locale),
      // Packed as "slot|price" and split by the formatter, the same shape the
      // shopkeeper's queue uses for its order rows.
      subtitle: `${pickLocale(row.slot_name, locale)}|${row.price_paid}`,
      href: '/admin/promotions',
      at: new Date(row.created_at),
      monogram: initial(row.shop_name),
    })),
    ...reviews.map((row): AdminQueueEntry => ({
      kind: 'reported_review',
      id: row.id,
      title: pickLocale(row.product_title, locale),
      subtitle: String(row.rating),
      href: '/admin/reviews',
      at: new Date(row.created_at),
      monogram: initial(row.shop_name),
    })),
    ...orders.map((row): AdminQueueEntry => ({
      kind: 'stale_order',
      id: row.id,
      title: row.reference,
      subtitle: row.shop_name ? pickLocale(row.shop_name, locale) : '',
      href: '/admin/orders?status=placed',
      at: new Date(row.created_at),
      monogram: row.shop_name ? initial(row.shop_name) : '',
    })),
  ];
}

/**
 * Promotion income for the current calendar month and the one before it
 * (PRD §7.3).
 *
 * CALENDAR months, not rolling 30-day windows, because this is the number the
 * mall invoices on and "this month" has to mean what it means on a statement.
 * Attributed to the month a campaign STARTS — a weekly flat fee is billed up
 * front (PRD §8.3), so pro-rating it across a run would show revenue that has
 * not been collected.
 */
export async function promotionRevenueMonths() {
  const rows = await db.execute(sql`
    select
      coalesce(sum(c.price_paid) filter (
        where c.starts_at >= date_trunc('month', now())
      ), 0)::int as this_month,
      coalesce(sum(c.price_paid) filter (
        where c.starts_at >= date_trunc('month', now()) - interval '1 month'
          and c.starts_at < date_trunc('month', now())
      ), 0)::int as last_month
    from campaigns c
    where c.status in ('approved', 'active', 'ended')
  `);

  const [row] = rows as unknown as Array<{ this_month: number; last_month: number }>;
  const thisMonth = Number(row?.this_month ?? 0);
  const lastMonth = Number(row?.last_month ?? 0);

  return {
    thisMonth,
    lastMonth,
    // Null rather than Infinity when there is no baseline — see the same rule
    // on the shopkeeper's KPI deltas.
    delta: lastMonth > 0 ? (thisMonth - lastMonth) / lastMonth : null,
  };
}

/**
 * Customers who signed up inside the window, with the previous window for the
 * delta. Customers only: a new shopkeeper is a tenant, and counting them here
 * would make a leasing win look like demand.
 */
export async function newCustomers(days: number) {
  const rows = await db.execute(sql`
    select
      count(*) filter (where u.created_at >= now() - (${days} * interval '1 day'))::int as current,
      count(*) filter (
        where u.created_at >= now() - (${days * 2} * interval '1 day')
          and u.created_at < now() - (${days} * interval '1 day')
      )::int as previous
    from users u
    where u.role = 'customer'
  `);

  const [row] = rows as unknown as Array<{ current: number; previous: number }>;
  const current = Number(row?.current ?? 0);
  const previous = Number(row?.previous ?? 0);

  return { current, previous, delta: previous > 0 ? (current - previous) / previous : null };
}
