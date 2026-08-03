import { and, asc, desc, eq, gt, gte, lte, sql } from 'drizzle-orm';

import { db } from '..';
import { campaigns, offers, products, promotionSlots } from '../schema';
import { slotAcceptsProduct, slotRequiresProduct } from '../../promotions';

/**
 * The shopkeeper's promotions view (PRD §6.4).
 *
 * Two mechanisms, deliberately kept apart all the way down to the query layer:
 * Offers are discounts the shop funds itself and need no approval (PRD §8.1),
 * Campaigns are visibility bought from Gulbahar and do (PRD §8.2). Merging them
 * into one "promotions" table would have made the approval rule a per-row
 * condition instead of a property of the type.
 */

export type OfferPhase = 'active' | 'scheduled' | 'expired';

/** Which of the three sections an offer belongs in, derived rather than stored. */
export function offerPhase(
  offer: { startsAt: Date; endsAt: Date; active: boolean },
  now: Date = new Date(),
): OfferPhase {
  if (!offer.active || offer.endsAt < now) return 'expired';
  if (offer.startsAt > now) return 'scheduled';
  return 'active';
}

export async function shopOffers(shopId: string) {
  const rows = await db
    .select({
      id: offers.id,
      name: offers.name,
      type: offers.type,
      value: offers.value,
      scope: offers.scope,
      productIds: offers.productIds,
      startsAt: offers.startsAt,
      endsAt: offers.endsAt,
      active: offers.active,
      createdAt: offers.createdAt,
    })
    .from(offers)
    .where(eq(offers.shopId, shopId))
    .orderBy(desc(offers.startsAt));

  return rows.map((row) => ({
    ...row,
    phase: offerPhase(row),
    productCount: row.scope === 'products' ? (row.productIds?.length ?? 0) : null,
  }));
}

export async function shopOfferById(shopId: string, offerId: string) {
  const [row] = await db
    .select()
    .from(offers)
    // shopId in the predicate is the ownership check.
    .where(and(eq(offers.id, offerId), eq(offers.shopId, shopId)))
    .limit(1);
  return row ?? null;
}

/** Published products, for the offer scope picker and the campaign booking step. */
export async function shopPublishedProducts(shopId: string) {
  return db
    .select({
      id: products.id,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
    })
    .from(products)
    .where(and(eq(products.shopId, shopId), eq(products.status, 'published')))
    .orderBy(asc(products.createdAt));
}

/**
 * Did the offer sell anything? (Prompt: self-funded offers get no readout.)
 *
 * A campaign comes back with impressions and clicks; an Offer — the mechanism
 * that costs the shop its own margin — came back with nothing at all, so a
 * shopkeeper had no way to tell a discount that worked from one that gave money
 * away. This answers the only question they can act on: units and revenue while
 * the offer ran, against the SAME LENGTH OF TIME immediately before it.
 *
 * Three deliberate limits, because the honest version is worth more than a
 * fuller-looking one:
 *
 *   - FULFILLED ORDERS ONLY, the same predicate the dashboard's revenue tile
 *     uses. A placed order is not money and the two figures must not disagree.
 *   - THE WINDOW STOPS AT `now` for a running offer, and the baseline is
 *     shortened to match. Comparing three days of an offer against a full week
 *     before it reports a collapse on every offer's first morning.
 *   - NO ATTRIBUTION IS CLAIMED. This is what happened during the window, not
 *     what the offer caused — the UI says so rather than printing a lift figure
 *     nothing here can support.
 */
export type OfferPerformance = {
  offerId: string;
  units: number;
  revenue: number;
  baselineUnits: number;
  baselineRevenue: number;
  /** Days of the offer measured so far — what the comparison actually covers. */
  measuredDays: number;
  /** Nothing sold in either window: say so instead of printing two zeros. */
  empty: boolean;
  /** The offer has not started, so there is nothing to measure yet. */
  notStarted: boolean;
};

export async function offerPerformance(
  shopId: string,
  offers: Array<{
    id: string;
    scope: 'shop' | 'products';
    productIds: string[] | null;
    startsAt: Date;
    endsAt: Date;
  }>,
  now: Date = new Date(),
): Promise<Map<string, OfferPerformance>> {
  const results = await Promise.all(
    offers.map(async (offer): Promise<OfferPerformance> => {
      const start = offer.startsAt;
      const end = offer.endsAt.getTime() < now.getTime() ? offer.endsAt : now;
      const span = end.getTime() - start.getTime();

      if (span <= 0) {
        return {
          offerId: offer.id,
          units: 0,
          revenue: 0,
          baselineUnits: 0,
          baselineRevenue: 0,
          measuredDays: 0,
          empty: true,
          notStarted: true,
        };
      }

      const baselineStart = new Date(start.getTime() - span);
      const ids = offer.scope === 'products' ? (offer.productIds ?? []) : [];

      // A products-scoped offer with no products attached measures nothing.
      if (offer.scope === 'products' && ids.length === 0) {
        return {
          offerId: offer.id,
          units: 0,
          revenue: 0,
          baselineUnits: 0,
          baselineRevenue: 0,
          measuredDays: Math.max(1, Math.round(span / 86_400_000)),
          empty: true,
          notStarted: false,
        };
      }

      /*
       * ISO strings with explicit ::timestamptz — inside a raw fragment drizzle
       * has no column to infer a type from and postgres.js rejects a bare Date
       * with a message nowhere near the cause (see slotInventory above).
       */
      const scope =
        ids.length > 0
          ? sql`and oi.product_id in (${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : sql``;

      const [row] = (await db.execute(sql`
        select
          coalesce(sum(oi.quantity) filter (
            where o.created_at >= ${start.toISOString()}::timestamptz
          ), 0)::int as units,
          coalesce(sum(oi.price_snapshot * oi.quantity) filter (
            where o.created_at >= ${start.toISOString()}::timestamptz
          ), 0)::int as revenue,
          coalesce(sum(oi.quantity) filter (
            where o.created_at < ${start.toISOString()}::timestamptz
          ), 0)::int as baseline_units,
          coalesce(sum(oi.price_snapshot * oi.quantity) filter (
            where o.created_at < ${start.toISOString()}::timestamptz
          ), 0)::int as baseline_revenue
        from order_items oi
        join orders o on o.id = oi.order_id
        where oi.shop_id = ${shopId}
          and o.status = 'fulfilled'
          and o.created_at >= ${baselineStart.toISOString()}::timestamptz
          and o.created_at < ${end.toISOString()}::timestamptz
          ${scope}
      `)) as unknown as Array<{
        units: number;
        revenue: number;
        baseline_units: number;
        baseline_revenue: number;
      }>;

      const units = Number(row?.units ?? 0);
      const revenue = Number(row?.revenue ?? 0);
      const baselineUnits = Number(row?.baseline_units ?? 0);
      const baselineRevenue = Number(row?.baseline_revenue ?? 0);

      return {
        offerId: offer.id,
        units,
        revenue,
        baselineUnits,
        baselineRevenue,
        measuredDays: Math.max(1, Math.round(span / 86_400_000)),
        empty: units === 0 && baselineUnits === 0,
        notStarted: false,
      };
    }),
  );

  return new Map(results.map((row) => [row.offerId, row]));
}

/* -------------------------------------------------------------------------- */
/* Featured slots                                                             */

/**
 * Slot inventory with live availability (PRD §6.4).
 *
 * `taken` counts campaigns that occupy the slot RIGHT NOW — approved and active
 * both hold a place, because an approved booking that has not started yet is still
 * sold. Counting only 'active' would oversell the slot.
 */
export async function slotInventory(shopId: string, now: Date = new Date()) {
  /*
   * ISO string + explicit ::timestamptz, not the Date itself. Inside a raw `sql`
   * fragment drizzle has no column to infer a type from, so the Date reaches
   * postgres.js untyped and it throws 'The "string" argument must be of type
   * string or an instance of Buffer' — nowhere near the actual cause.
   */
  const at = now.toISOString();

  const rows = await db
    .select({
      id: promotionSlots.id,
      key: promotionSlots.key,
      name: promotionSlots.name,
      capacity: promotionSlots.capacity,
      pricePerWeek: promotionSlots.pricePerWeek,
      taken: sql<number>`(
        select count(*)::int from campaigns c
        where c.slot_id = promotion_slots.id
          and c.status in ('approved', 'active')
          and c.ends_at >= ${at}::timestamptz
      )`,
      /** Does this shop already hold or await a place in the slot? */
      mine: sql<number>`(
        select count(*)::int from campaigns c
        where c.slot_id = promotion_slots.id
          and c.shop_id = ${shopId}
          and c.status in ('requested', 'approved', 'active')
          and c.ends_at >= ${at}::timestamptz
      )`,
      /*
       * WHAT A WEEK IN THIS SLOT HAS BEEN WORTH, IN CUSTOMERS (Prompt C15).
       *
       * The card sold placement on price and capacity — «؋۲٬۵۰۰ در هفته · ۲ از
       * ۳ جای خالی» — which tells a shopkeeper what it costs and nothing about
       * what it does. Impressions would have been the industry answer and the
       * wrong one for this reader; CLICKS are people who arrived, which is the
       * unit a shopkeeper counts in.
       *
       * Averaged per WEEK over every campaign the mall has run in this slot in
       * the last ninety days, so it is a real observation rather than a
       * promise. A slot nobody has bought yet returns 0 and the card says
       * nothing rather than inventing a number.
       */
      weeklyVisitors: sql<number>`(
        select coalesce(round(
          sum(c.clicks)::numeric / nullif(sum(
            greatest(
              1,
              extract(epoch from (least(c.ends_at, ${at}::timestamptz) - c.starts_at)) / 604800
            )
          ), 0)
        )::int, 0)
        from campaigns c
        where c.slot_id = promotion_slots.id
          and c.status in ('active', 'ended')
          and c.ends_at >= ${at}::timestamptz - interval '90 days'
          and c.starts_at <= ${at}::timestamptz
      )`,
    })
    .from(promotionSlots)
    .orderBy(desc(promotionSlots.pricePerWeek));

  return rows.map((row) => ({
    ...row,
    available: Math.max(row.capacity - row.taken, 0),
    // Offer the picker whenever the slot can use a product; only block submission
    // when it must have one (see lib/promotions.ts).
    acceptsProduct: slotAcceptsProduct(row.key),
    needsProduct: slotRequiresProduct(row.key),
  }));
}

export async function shopCampaigns(shopId: string) {
  return db
    .select({
      id: campaigns.id,
      status: campaigns.status,
      startsAt: campaigns.startsAt,
      endsAt: campaigns.endsAt,
      pricePaid: campaigns.pricePaid,
      impressions: campaigns.impressions,
      clicks: campaigns.clicks,
      rejectionReason: campaigns.rejectionReason,
      slotKey: promotionSlots.key,
      slotName: promotionSlots.name,
      slotPricePerWeek: promotionSlots.pricePerWeek,
      productId: campaigns.productId,
      productTitle: products.title,
      // Whole days left, floored at zero — "0 days" reads better than "-3".
      daysLeft: sql<number>`greatest(0, ceil(extract(epoch from (${campaigns.endsAt} - now())) / 86400))::int`,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .leftJoin(products, eq(campaigns.productId, products.id))
    .where(eq(campaigns.shopId, shopId))
    .orderBy(desc(campaigns.startsAt));
}

/** Spend and reach this shop has bought, for the promotions header. */
export async function shopCampaignTotals(shopId: string) {
  const [row] = await db
    .select({
      activeCount: sql<number>`count(*) filter (where ${campaigns.status} = 'active')::int`,
      requestedCount: sql<number>`count(*) filter (where ${campaigns.status} = 'requested')::int`,
      totalSpend: sql<number>`coalesce(sum(${campaigns.pricePaid}) filter (where ${campaigns.status} in ('active','ended')), 0)::int`,
      impressions: sql<number>`coalesce(sum(${campaigns.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${campaigns.clicks}), 0)::int`,
    })
    .from(campaigns)
    .where(eq(campaigns.shopId, shopId));

  return row ?? { activeCount: 0, requestedCount: 0, totalSpend: 0, impressions: 0, clicks: 0 };
}

/**
 * Is a slot still bookable for a window? Counts only bookings whose window
 * OVERLAPS the requested one, so a slot that is full this week is still sellable
 * for next month.
 *
 * Advisory, not a lock: two shops booking the last place in the same instant could
 * both pass. That is acceptable here because a booking lands as `requested` and an
 * admin decides — the oversell would be caught by a human before anything runs. A
 * real capacity constraint belongs with real billing, in phase 2.
 */
export async function slotAvailability(slotId: string, from: Date, to: Date) {
  // See slotInventory: raw fragments need ISO strings with an explicit cast.
  const [fromIso, toIso] = [from.toISOString(), to.toISOString()];

  const [row] = await db
    .select({
      capacity: promotionSlots.capacity,
      pricePerWeek: promotionSlots.pricePerWeek,
      key: promotionSlots.key,
      overlapping: sql<number>`(
        select count(*)::int from campaigns c
        where c.slot_id = promotion_slots.id
          and c.status in ('approved', 'active')
          and c.starts_at <= ${toIso}::timestamptz and c.ends_at >= ${fromIso}::timestamptz
      )`,
    })
    .from(promotionSlots)
    .where(eq(promotionSlots.id, slotId))
    .limit(1);

  if (!row) return null;
  return { ...row, available: Math.max(row.capacity - row.overlapping, 0) };
}

/**
 * Offers whose window covers now, for the countdown preview. Kept separate from
 * shopOffers so the preview cannot accidentally show an expired offer counting
 * down to a date in the past.
 */
export async function shopActiveOfferCount(shopId: string, now: Date = new Date()) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(offers)
    .where(
      and(
        eq(offers.shopId, shopId),
        eq(offers.active, true),
        lte(offers.startsAt, now),
        gte(offers.endsAt, now),
      ),
    );
  return row?.n ?? 0;
}

/** Campaigns ending within a week, so the renew shortcut can be surfaced. */
export async function expiringCampaigns(shopId: string, now: Date = new Date()) {
  const weekOut = new Date(now.getTime() + 7 * 86_400_000);
  return db
    .select({ id: campaigns.id, endsAt: campaigns.endsAt, slotName: promotionSlots.name })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .where(
      and(
        eq(campaigns.shopId, shopId),
        eq(campaigns.status, 'active'),
        gt(campaigns.endsAt, now),
        lte(campaigns.endsAt, weekOut),
      ),
    );
}
