import { sql } from 'drizzle-orm';

import { db } from '..';
import type { LocalizedText, ShopStatus } from '../schema';

/**
 * The mall as a BUILDING (Prompt C9).
 *
 * These are the queries no generic marketplace admin has, because no generic
 * marketplace has floors, numbered units, or a landlord who thinks in both.
 *
 * `days` rather than a Date, so the clock is read here and not during render
 * (React 19 purity, CLAUDE.md).
 */

function since(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export type FloorShop = {
  id: string;
  slug: string;
  name: LocalizedText;
  status: ShopStatus;
  unitNumber: string | null;
  unitValue: number | null;
  logoPath: string | null;
  verifiedAt: Date | null;
  productCount: number;
  revenue: number;
};

export type Floor = {
  floor: number;
  shops: FloorShop[];
  /** Unit numbers inside the occupied range that no shop holds — see below. */
  vacantUnits: number[];
  counts: { active: number; pending: number; unverified: number };
  revenue: number;
};

/**
 * Floors, their tenants, and the gaps between them.
 *
 * VACANT UNITS ARE DERIVED, never listed. The mall's real unit inventory is not
 * in this database — nobody typed "floor 2 has units 201 to 240" — so inventing
 * that list would put a hard-coded fiction on the screen a landlord trusts most.
 * What the data DOES support is a gap: floor 2 holds units 201 and 214, so 202
 * through 213 are numbers inside the occupied range that no tenant holds. That
 * is a true statement, and the page says it in those words rather than claiming
 * to know the floor's capacity.
 *
 * REVENUE IS FULFILLED MONEY, attributed through order_items so a basket split
 * across two floors is split between them — the same predicate the revenue
 * report uses (Prompt C2), which is what lets the two screens reconcile.
 */
export async function floorOccupancy(days: number): Promise<Floor[]> {
  const rows = await db.execute(sql`
    select
      s.floor::int as floor,
      s.id::text as id,
      s.slug as slug,
      s.name as name,
      s.status::text as status,
      s.unit_number as unit_number,
      s.logo_path as logo_path,
      s.verified_at as verified_at,
      (select count(*)::int from products p
        where p.shop_id = s.id and p.status = 'published') as product_count,
      coalesce((
        select sum(oi.price_snapshot * oi.quantity)::int
        from order_items oi
        join orders o on o.id = oi.order_id
        where oi.shop_id = s.id
          and o.status = 'fulfilled'
          and o.created_at >= ${since(days)}::timestamptz
      ), 0) as revenue
    from shops s
    where s.floor is not null and s.status <> 'closed'
    order by s.floor asc, s.unit_number asc
  `);

  const byFloor = new Map<number, FloorShop[]>();
  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    const floor = Number(row.floor);
    const unitNumber = row.unit_number === null ? null : String(row.unit_number);
    const parsed = unitNumber === null ? Number.NaN : Number(unitNumber);

    const shop: FloorShop = {
      id: String(row.id),
      slug: String(row.slug),
      name: row.name as LocalizedText,
      status: String(row.status) as ShopStatus,
      unitNumber,
      unitValue: Number.isNaN(parsed) ? null : parsed,
      logoPath: row.logo_path === null ? null : String(row.logo_path),
      verifiedAt: row.verified_at ? new Date(String(row.verified_at)) : null,
      productCount: Number(row.product_count),
      revenue: Number(row.revenue),
    };

    const list = byFloor.get(floor) ?? [];
    list.push(shop);
    byFloor.set(floor, list);
  }

  return [...byFloor.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floor, shops]) => {
      const held = new Set(
        shops.map((shop) => shop.unitValue).filter((value): value is number => value !== null),
      );

      const vacantUnits: number[] = [];
      if (held.size > 1) {
        const lowest = Math.min(...held);
        const highest = Math.max(...held);
        for (let unit = lowest + 1; unit < highest; unit += 1) {
          if (!held.has(unit)) vacantUnits.push(unit);
        }
      }

      return {
        floor,
        shops,
        vacantUnits,
        counts: {
          active: shops.filter((shop) => shop.status === 'approved').length,
          pending: shops.filter((shop) => shop.status === 'pending').length,
          unverified: shops.filter((shop) => shop.status === 'approved' && !shop.verifiedAt).length,
        },
        revenue: shops.reduce((sum, shop) => sum + shop.revenue, 0),
      };
    });
}

export type HealthFlag =
  | 'slow_acceptance'
  | 'high_rejection'
  | 'falling_rating'
  | 'no_products'
  | 'verification_expired';

export type ShopHealth = {
  id: string;
  slug: string;
  name: LocalizedText;
  floor: number | null;
  unitNumber: string | null;
  flags: HealthFlag[];
  /** Hours, median, over the window. Null when they accepted nothing. */
  medianAcceptHours: number | null;
  rejectionRate: number;
  ratingRecent: number | null;
  ratingEarlier: number | null;
  publishedProducts: number;
  ordersInWindow: number;
  /**
   * Products this shop ADDED inside the window, and in the window before it.
   *
   * A count of published listings says how big the catalogue is; the pair says
   * whether anyone is still tending it. A tenant with sixty products who has
   * added nothing in ninety days is a shop that has stopped, and the single
   * number cannot tell that apart from a shop that opened last week.
   */
  productsAdded: number;
  productsAddedBefore: number;
  /**
   * Days since this shop last received an order. Null when it never has.
   *
   * The FIRST signal on the roster, because it is the one a landlord acts on:
   * everything else on this list is a shop trading badly, and this is a shop
   * not trading at all.
   */
  daysSinceLastOrder: number | null;
  /** Fulfilled money in the window — the same figure the directory shows. */
  revenue: number;
  /**
   * Vacation mode, set by the SHOPKEEPER (`shops.pausedUntil`).
   *
   * Carried here so the health row can say so before the admin picks up the
   * phone. Every flag on this list is "you are costing the mall customers"; a
   * shop that announced it would be shut for a week is not neglecting anything,
   * and a nudge about slow acceptance is the landlord not having read their
   * own notice board.
   */
  pausedUntil: Date | null;
  /**
   * Whether the pause is in force RIGHT NOW.
   *
   * Compared in SQL rather than in the component: a React 19 component may not
   * call `Date.now()` during render, server or not, and the lint rule enforces
   * it. The clock read belongs to the query (CLAUDE.md).
   */
  paused: boolean;
};

/** Above this a shop is keeping customers waiting rather than trading. */
const SLOW_ACCEPT_HOURS = 12;
/** One in five turned away is a pattern, not a bad week. */
const HIGH_REJECTION_RATE = 0.2;
/** Half a star of drift is visible on a card; less is noise at this volume. */
const RATING_DROP = 0.5;
/** Below this the medians and rates are anecdotes, so no flag is raised. */
const MIN_ORDERS_FOR_RATE = 5;

/**
 * Shops a landlord should look at (Prompt C9).
 *
 * A LANDLORD'S LIST, NOT A MODERATOR'S. Every flag here is something that costs
 * the mall its reputation with shoppers and that the tenant can fix: leaving
 * orders unaccepted, turning business away, sliding ratings, an empty shelf, or
 * paperwork that has lapsed. None of them is a rule violation, and none of them
 * has a punishment attached — the action offered on the page is a nudge.
 *
 * THE THRESHOLDS ARE NAMED CONSTANTS with a minimum sample size, because a flag
 * that fires on one rejected order out of two is worse than no flag: it teaches
 * the reader to ignore the column.
 */
export async function shopHealth(
  days: number,
  /**
   * THE WHOLE ROSTER, NOT JUST THE SICK (Prompt C12).
   *
   * A view that shows only flagged tenants answers "who is broken" and hides
   * the answer to "how is the mall doing" — and on a good week it renders an
   * empty state, which is the least commanding thing a command screen can do.
   * Ranked with the sick at the top, the same list says both: the reader sees
   * the whole building, in order of who needs them.
   */
  options: { includeHealthy?: boolean } = {},
): Promise<ShopHealth[]> {
  const rows = await db.execute(sql`
    with window_orders as (
      select distinct o.id, oi.shop_id, o.status, o.created_at
      from orders o
      join order_items oi on oi.order_id = o.id
      where o.created_at >= ${since(days)}::timestamptz
    ),
    accept_times as (
      select
        wo.shop_id,
        percentile_cont(0.5) within group (
          order by extract(epoch from (e.created_at - wo.created_at)) / 3600
        ) as median_hours
      from window_orders wo
      join order_events e on e.order_id = wo.id and e.to_status = 'accepted'
      group by wo.shop_id
    )
    select
      s.id::text as id,
      s.slug as slug,
      s.name as name,
      s.floor::int as floor,
      s.unit_number as unit_number,
      s.verified_at as verified_at,
      s.paused_until as paused_until,
      (s.paused_until is not null and s.paused_until > now()) as paused,
      (select count(*)::int from products p
        where p.shop_id = s.id and p.status = 'published') as published_products,
      coalesce((select count(*)::int from window_orders w where w.shop_id = s.id), 0)
        as orders_in_window,
      coalesce((select count(*)::int from window_orders w
        where w.shop_id = s.id and w.status = 'rejected'), 0) as rejected_orders,
      (select at.median_hours from accept_times at where at.shop_id = s.id) as median_accept_hours,
      /*
       * The rating SPLIT IN HALF over the window, so "falling" is a comparison
       * rather than a level. A shop sitting steadily at 3.2 is not falling and
       * does not need a landlord's phone call; a shop that went from 4.6 to 3.9
       * does, and a single average cannot tell them apart.
       */
      (select avg(sr.rating)::float8 from shop_reviews sr
        where sr.shop_id = s.id and sr.status = 'visible'
          and sr.created_at >= ${since(days / 2)}::timestamptz) as rating_recent,
      (select avg(sr.rating)::float8 from shop_reviews sr
        where sr.shop_id = s.id and sr.status = 'visible'
          and sr.created_at >= ${since(days)}::timestamptz
          and sr.created_at < ${since(days / 2)}::timestamptz) as rating_earlier,
      (select ver.expires_at from shop_verifications ver
        where ver.shop_id = s.id and ver.status = 'verified'
        order by ver.decided_at desc limit 1) as verification_expires_at,
      /*
       * CATALOGUE MOVEMENT, as two counts rather than one.
       *
       * products.created_at is the only listing timestamp this schema keeps,
       * so "added" means created, not published — which is the honest reading
       * and is what a landlord asking "are they still working on it" wants.
       */
      (select count(*)::int from products p
        where p.shop_id = s.id and p.status <> 'archived'
          and p.created_at >= ${since(days)}::timestamptz) as products_added,
      (select count(*)::int from products p
        where p.shop_id = s.id and p.status <> 'archived'
          and p.created_at >= ${since(days * 2)}::timestamptz
          and p.created_at < ${since(days)}::timestamptz) as products_added_before,
      -- Whole days since the last order of ANY status: a rejected order is
      -- still a customer who found them.
      (select extract(day from (now() - max(o.created_at)))::int
        from order_items oi join orders o on o.id = oi.order_id
        where oi.shop_id = s.id) as days_since_last_order,
      coalesce((
        select sum(oi.price_snapshot * oi.quantity)::int
        from order_items oi join orders o on o.id = oi.order_id
        where oi.shop_id = s.id and o.status = 'fulfilled'
          and o.created_at >= ${since(days)}::timestamptz
      ), 0) as revenue
    from shops s
    where s.status = 'approved'
    order by s.floor asc nulls last, s.unit_number asc
  `);

  const now = Date.now();

  return (rows as unknown as Array<Record<string, unknown>>)
    .map((row) => {
      const ordersInWindow = Number(row.orders_in_window);
      const rejected = Number(row.rejected_orders);
      const rejectionRate = ordersInWindow > 0 ? rejected / ordersInWindow : 0;
      const medianAcceptHours =
        row.median_accept_hours === null ? null : Number(row.median_accept_hours);
      const ratingRecent = row.rating_recent === null ? null : Number(row.rating_recent);
      const ratingEarlier = row.rating_earlier === null ? null : Number(row.rating_earlier);
      const publishedProducts = Number(row.published_products);
      const expiresAt = row.verification_expires_at
        ? new Date(String(row.verification_expires_at))
        : null;

      const flags: HealthFlag[] = [];
      if (medianAcceptHours !== null && medianAcceptHours > SLOW_ACCEPT_HOURS) {
        flags.push('slow_acceptance');
      }
      if (ordersInWindow >= MIN_ORDERS_FOR_RATE && rejectionRate >= HIGH_REJECTION_RATE) {
        flags.push('high_rejection');
      }
      if (
        ratingRecent !== null &&
        ratingEarlier !== null &&
        ratingEarlier - ratingRecent >= RATING_DROP
      ) {
        flags.push('falling_rating');
      }
      if (publishedProducts === 0) flags.push('no_products');
      if (expiresAt && expiresAt.getTime() < now) flags.push('verification_expired');

      return {
        id: String(row.id),
        slug: String(row.slug),
        name: row.name as LocalizedText,
        floor: row.floor === null ? null : Number(row.floor),
        unitNumber: row.unit_number === null ? null : String(row.unit_number),
        flags,
        medianAcceptHours,
        rejectionRate,
        ratingRecent,
        ratingEarlier,
        publishedProducts,
        ordersInWindow,
        productsAdded: Number(row.products_added),
        productsAddedBefore: Number(row.products_added_before),
        daysSinceLastOrder:
          row.days_since_last_order === null ? null : Number(row.days_since_last_order),
        revenue: Number(row.revenue),
        pausedUntil: row.paused_until ? new Date(String(row.paused_until)) : null,
        paused: row.paused === true,
      };
    })
    .filter((shop) => options.includeHealthy || shop.flags.length > 0)
    /*
     * SICK AT THE TOP, then quiet, then the rest.
     *
     * Flag count first — a shop failing three ways is the one to call today —
     * and silence as the tie-break, because a tenant with no flags who has not
     * taken an order in six weeks is a problem the flags cannot see. Shops that
     * have NEVER traded sort as maximally silent rather than as missing data.
     */
    .sort((a, b) => {
      if (b.flags.length !== a.flags.length) return b.flags.length - a.flags.length;
      const silence = (shop: ShopHealth) =>
        shop.daysSinceLastOrder === null ? Number.MAX_SAFE_INTEGER : shop.daysSinceLastOrder;
      return silence(b) - silence(a);
    });
}

export type MapUnit = {
  unit: number;
  shop: {
    id: string;
    slug: string;
    name: LocalizedText;
    categorySlug: string | null;
    categoryName: LocalizedText | null;
    hours: string | null;
    logoPath: string | null;
    productCount: number;
  } | null;
};

export type MapFloor = { floor: number; units: MapUnit[] };

/**
 * The public floor map (Prompt C11).
 *
 * A DIFFERENT QUERY FROM `floorOccupancy`, deliberately, even though both walk
 * the same table. The admin view is about the business — revenue, verification,
 * pending applications — and a shopper needs none of that and must not see
 * suspended tenants at all. Sharing one query would mean a `public: boolean`
 * flag threaded through every field, which is how a suspended shop eventually
 * appears on a customer's map.
 *
 * The vacant units are the SAME derivation as the admin view: gaps inside the
 * occupied range, never a hard-coded inventory. They are drawn because a plan
 * with no gaps in it does not read as a building.
 */
export async function mallMap(): Promise<MapFloor[]> {
  const rows = await db.execute(sql`
    select
      s.floor::int as floor,
      s.id::text as id,
      s.slug as slug,
      s.name as name,
      s.unit_number as unit_number,
      s.hours as hours,
      s.logo_path as logo_path,
      c.slug as category_slug,
      c.name as category_name,
      (select count(*)::int from products p
        where p.shop_id = s.id and p.status = 'published') as product_count
    from shops s
    left join categories c on c.id = s.category_id
    where s.floor is not null and s.status = 'approved'
    order by s.floor asc, s.unit_number asc
  `);

  const byFloor = new Map<number, MapUnit[]>();

  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    const floor = Number(row.floor);
    const unit = Number(row.unit_number);
    if (Number.isNaN(unit)) continue;

    const list = byFloor.get(floor) ?? [];
    list.push({
      unit,
      shop: {
        id: String(row.id),
        slug: String(row.slug),
        name: row.name as LocalizedText,
        categorySlug: row.category_slug === null ? null : String(row.category_slug),
        categoryName: row.category_name === null ? null : (row.category_name as LocalizedText),
        hours: row.hours === null ? null : String(row.hours),
        logoPath: row.logo_path === null ? null : String(row.logo_path),
        productCount: Number(row.product_count),
      },
    });
    byFloor.set(floor, list);
  }

  return [...byFloor.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floor, occupied]) => {
      const held = new Set(occupied.map((entry) => entry.unit));
      const lowest = Math.min(...held);
      const highest = Math.max(...held);

      const units: MapUnit[] = [];
      for (let unit = lowest; unit <= highest; unit += 1) {
        const match = occupied.find((entry) => entry.unit === unit);
        units.push(match ?? { unit, shop: null });
      }

      return { floor, units };
    });
}
