'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { campaigns, offers, products, promotionSlots } from '../db/schema';
import { slotAvailability } from '../db/queries/shop-promotions';
import { shopNameFor } from '../db/queries/shop-orders';
import { notify } from '../notify';
import { slotNeedsProduct } from '../promotions';

/**
 * Offers and campaign bookings (PRD §6.4, §8).
 *
 * The asymmetry between the two is the point: an offer is the shop's own money, so
 * it takes effect immediately; a campaign is Gulbahar's inventory, so it lands as
 * `requested` and an admin decides (PRD §13.3). Nothing here can create an
 * approved campaign — that path belongs to admin alone.
 */

export type PromotionActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId) return null;
  if (user.role !== 'shopkeeper') return null;
  return { userId: user.id, shopId: user.shopId };
}

/* -------------------------------------------------------------------------- */
/* Offers                                                                     */

const offerSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.object({
      fa: z.string().trim().min(1, { message: 'fa_required' }),
      en: z.string().trim().optional().nullable(),
    }),
    type: z.enum(['percent', 'fixed']),
    value: z.coerce.number().int().positive({ message: 'value_positive' }),
    scope: z.enum(['shop', 'products']),
    productIds: z.array(z.string().uuid()).optional(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    active: z.boolean().optional(),
  })
  .refine((value) => value.type !== 'percent' || value.value <= 90, {
    // Above 90% off the arithmetic still works but the offer is almost certainly a
    // typo, and it would run live on the storefront.
    message: 'percent_too_high',
  })
  .refine((value) => value.scope !== 'products' || (value.productIds?.length ?? 0) > 0, {
    message: 'products_required',
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'end_after_start',
  });

export type OfferInput = z.input<typeof offerSchema>;

const KNOWN_OFFER_CODES = new Set([
  'fa_required',
  'value_positive',
  'percent_too_high',
  'products_required',
  'end_after_start',
]);

export async function saveOffer(input: OfferInput): Promise<PromotionActionResult<{ id: string }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = offerSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message && KNOWN_OFFER_CODES.has(message) ? message : 'invalid_input',
    };
  }

  const data = parsed.data;

  /*
   * Scoped product ids are re-checked against this shop's own catalogue. Without
   * this, a crafted request could attach a discount to another shop's product —
   * the offer row itself carries only the shop id, so nothing downstream would
   * catch it.
   */
  let productIds: string[] | null = null;
  if (data.scope === 'products' && data.productIds?.length) {
    const owned = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.shopId, context.shopId), inArray(products.id, data.productIds)));
    if (owned.length !== data.productIds.length) return { ok: false, error: 'products_not_yours' };
    productIds = owned.map((row) => row.id);
  }

  const values = {
    name: { fa: data.name.fa, en: data.name.en ?? null, ps: null },
    type: data.type,
    value: data.value,
    scope: data.scope,
    productIds,
    startsAt: new Date(data.startsAt),
    endsAt: new Date(data.endsAt),
    active: data.active ?? true,
  };

  let offerId = data.id;

  if (offerId) {
    const [updated] = await db
      .update(offers)
      .set(values)
      .where(and(eq(offers.id, offerId), eq(offers.shopId, context.shopId)))
      .returning({ id: offers.id });
    if (!updated) return { ok: false, error: 'not_found' };
  } else {
    const [created] = await db
      .insert(offers)
      .values({ ...values, shopId: context.shopId })
      .returning({ id: offers.id });
    offerId = created.id;
  }

  // Discounts change what the storefront shows, everywhere.
  revalidatePath('/dashboard/promotions');
  revalidatePath('/');
  revalidatePath('/offers');
  revalidatePath('/products');

  return { ok: true, data: { id: offerId } };
}

/** Ends an offer now rather than deleting it, so its history survives. */
export async function endOffer(offerId: string): Promise<PromotionActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(offerId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(offers)
    .set({ active: false })
    .where(and(eq(offers.id, parsed.data), eq(offers.shopId, context.shopId)))
    .returning({ id: offers.id });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard/promotions');
  revalidatePath('/');
  revalidatePath('/offers');
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Featured campaigns                                                         */

const bookingSchema = z.object({
  slotId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  weeks: z.coerce.number().int().min(1).max(12),
  /** Defaults to now; a shop may book a window that starts later. */
  startsAt: z.string().optional(),
});

export type BookingInput = z.input<typeof bookingSchema>;

export async function requestCampaign(
  input: BookingInput,
): Promise<PromotionActionResult<{ id: string; pricePaid: number }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { slotId, weeks } = parsed.data;

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + weeks * 7 * 86_400_000);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: 'invalid_input' };

  const slot = await slotAvailability(slotId, startsAt, endsAt);
  if (!slot) return { ok: false, error: 'slot_not_found' };
  if (slot.available <= 0) return { ok: false, error: 'slot_full' };

  // Product-level slots must name a product, and it must be this shop's.
  let productId: string | null = null;
  if (slotNeedsProduct(slot.key)) {
    if (!parsed.data.productId) return { ok: false, error: 'product_required' };
    const [owned] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, parsed.data.productId),
          eq(products.shopId, context.shopId),
          eq(products.status, 'published'),
        ),
      )
      .limit(1);
    if (!owned) return { ok: false, error: 'product_not_publishable' };
    productId = owned.id;
  }

  // Price is snapshotted, so a later rate change never rewrites revenue.
  const pricePaid = slot.pricePerWeek * weeks;

  const [created] = await db
    .insert(campaigns)
    .values({
      slotId,
      shopId: context.shopId,
      productId,
      // Never 'approved' from this path — admin decides (PRD §13.3).
      status: 'requested',
      startsAt,
      endsAt,
      pricePaid,
    })
    .returning({ id: campaigns.id });

  const [slotRow] = await db
    .select({ name: promotionSlots.name })
    .from(promotionSlots)
    .where(eq(promotionSlots.id, slotId))
    .limit(1);
  const shop = await shopNameFor(context.shopId);

  // The request lands in the admin queue as a notification addressed to the role.
  await notify({
    eventKey: 'campaign.requested',
    recipientUserId: null,
    recipientRole: 'admin',
    values: {
      shopName: shop ? pickLocale(shop.name, 'fa') : '',
      slotName: slotRow ? pickLocale(slotRow.name, 'fa') : '',
      weeks,
    },
  });

  revalidatePath('/dashboard/promotions');
  revalidatePath('/admin/promotions');

  return { ok: true, data: { id: created.id, pricePaid } };
}

/**
 * Renew shortcut for a running or ended campaign (PRD §6.4): books the same slot
 * and product again rather than making the shopkeeper re-pick both.
 */
export async function renewCampaign(
  campaignId: string,
  weeks: number,
): Promise<PromotionActionResult<{ id: string; pricePaid: number }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z
    .object({ campaignId: z.string().uuid(), weeks: z.number().int().min(1).max(12) })
    .safeParse({ campaignId, weeks });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [existing] = await db
    .select({
      slotId: campaigns.slotId,
      productId: campaigns.productId,
      endsAt: campaigns.endsAt,
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, parsed.data.campaignId), eq(campaigns.shopId, context.shopId)))
    .limit(1);

  if (!existing) return { ok: false, error: 'not_found' };

  // A renewal starts where the current run ends, so there is no gap in placement.
  const now = new Date();
  const startsAt = existing.endsAt > now ? existing.endsAt : now;

  return requestCampaign({
    slotId: existing.slotId,
    productId: existing.productId,
    weeks: parsed.data.weeks,
    startsAt: startsAt.toISOString(),
  });
}

/** Withdraws a booking that admin has not decided on yet. */
export async function cancelCampaignRequest(campaignId: string): Promise<PromotionActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [deleted] = await db
    .delete(campaigns)
    .where(
      and(
        eq(campaigns.id, parsed.data),
        eq(campaigns.shopId, context.shopId),
        // Only an undecided request may be withdrawn; an approved booking is a
        // commitment on both sides.
        eq(campaigns.status, 'requested'),
      ),
    )
    .returning({ id: campaigns.id });

  if (!deleted) return { ok: false, error: 'not_withdrawable' };

  revalidatePath('/dashboard/promotions');
  revalidatePath('/admin/promotions');
  return { ok: true };
}

/** Used by the booking summary so the quoted price is the server's, not the client's. */
export async function quoteCampaign(
  slotId: string,
  weeks: number,
): Promise<PromotionActionResult<{ pricePaid: number; endsAt: string; available: number }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z
    .object({ slotId: z.string().uuid(), weeks: z.number().int().min(1).max(12) })
    .safeParse({ slotId, weeks });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + parsed.data.weeks * 7 * 86_400_000);
  const slot = await slotAvailability(parsed.data.slotId, startsAt, endsAt);
  if (!slot) return { ok: false, error: 'slot_not_found' };

  return {
    ok: true,
    data: {
      pricePaid: slot.pricePerWeek * parsed.data.weeks,
      endsAt: endsAt.toISOString(),
      available: slot.available,
    },
  };
}
