'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { campaigns, products, promotionSlots, shopMembers, shops, users } from '../db/schema';
import { slotAvailability } from '../db/queries/shop-promotions';
import { formatDate } from '../format';
import { notifyMany } from '../notify';
import { slotNeedsProduct } from '../promotions';

/**
 * Promotion inventory and campaign decisions (PRD §7.3).
 *
 * Admin owns the placement inventory outright — capacity and price are Gulbahar's
 * to set — so those get a plain editor. Campaign requests are the other half of the
 * transaction the shop side starts (lib/actions/shop-promotions.ts): a shop may only
 * ever create a `requested` campaign, and only this file can approve one.
 *
 * Approval sets 'active' when the window has already begun and 'approved' when it
 * starts later, because the storefront's promoted-slot query matches on 'active'
 * plus the date window. Marking a future booking 'active' would put it on the home
 * page a week early.
 */

export type AdminActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

async function requireAdminContext() {
  const user = await currentUser();
  if (!user?.id || user.role !== 'admin') return null;
  return { userId: user.id };
}

function revalidatePromotions() {
  revalidatePath('/admin/promotions');
  revalidatePath('/admin/revenue');
  revalidatePath('/dashboard/promotions');
  // Promoted placements appear on these surfaces.
  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath('/shops');
}

/** Notifies every member of a shop, each in their own language. */
async function notifyShop(
  shopId: string,
  eventKey: 'campaign.approved' | 'campaign.rejected',
  build: (locale: 'fa' | 'en' | 'ps') => Record<string, string | number>,
) {
  const members = await db
    .select({ id: users.id, locale: users.locale })
    .from(shopMembers)
    .innerJoin(users, eq(shopMembers.userId, users.id))
    .where(eq(shopMembers.shopId, shopId));

  await notifyMany(
    members.map((member) => ({
      eventKey,
      recipientUserId: member.id,
      recipientRole: 'shopkeeper' as const,
      locale: member.locale,
      values: build(member.locale),
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* Slot inventory                                                             */

const slotSchema = z.object({
  slotId: z.string().uuid(),
  capacity: z.coerce.number().int().min(1, { message: 'capacity_min' }).max(20),
  pricePerWeek: z.coerce.number().int().min(1, { message: 'price_min' }).max(1_000_000),
});

const KNOWN_SLOT_CODES = new Set(['capacity_min', 'price_min']);

/**
 * Edits a slot's capacity and weekly price (PRD §7.3).
 *
 * Lowering capacity below what is currently sold is refused rather than silently
 * oversubscribing the slot — the storefront caps promoted results at capacity
 * (PRD §8.4), so the excess campaigns would simply stop appearing while still being
 * billed.
 *
 * A price change affects only FUTURE bookings: existing campaigns keep the
 * price_paid they were sold at.
 */
export async function updateSlot(input: z.input<typeof slotSchema>): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message && KNOWN_SLOT_CODES.has(message) ? message : 'invalid_input',
    };
  }

  const now = new Date();
  const current = await slotAvailability(parsed.data.slotId, now, now);
  if (!current) return { ok: false, error: 'not_found' };

  if (parsed.data.capacity < current.overlapping) {
    return { ok: false, error: 'capacity_below_sold' };
  }

  await db
    .update(promotionSlots)
    .set({ capacity: parsed.data.capacity, pricePerWeek: parsed.data.pricePerWeek })
    .where(eq(promotionSlots.id, parsed.data.slotId));

  revalidatePromotions();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Campaign decisions                                                         */

export async function approveCampaign(campaignId: string): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [request] = await db
    .select({
      id: campaigns.id,
      shopId: campaigns.shopId,
      slotId: campaigns.slotId,
      startsAt: campaigns.startsAt,
      endsAt: campaigns.endsAt,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(eq(campaigns.id, parsed.data))
    .limit(1);

  if (!request) return { ok: false, error: 'not_found' };
  if (request.status !== 'requested') return { ok: false, error: 'not_pending' };

  // Would approving this oversell the slot for the window it covers?
  const availability = await slotAvailability(request.slotId, request.startsAt, request.endsAt);
  if (!availability) return { ok: false, error: 'not_found' };
  if (availability.available <= 0) return { ok: false, error: 'slot_full' };

  const now = new Date();
  const live = request.startsAt <= now && request.endsAt >= now;

  const [updated] = await db
    .update(campaigns)
    .set({ status: live ? 'active' : 'approved', rejectionReason: null })
    .where(and(eq(campaigns.id, request.id), eq(campaigns.status, 'requested')))
    .returning({ id: campaigns.id, endsAt: campaigns.endsAt });

  if (!updated) return { ok: false, error: 'not_pending' };

  const [slot] = await db
    .select({ name: promotionSlots.name })
    .from(promotionSlots)
    .where(eq(promotionSlots.id, request.slotId))
    .limit(1);

  await notifyShop(request.shopId, 'campaign.approved', (locale) => ({
    slotName: slot ? pickLocale(slot.name, locale) : '',
    endsAt: formatDate(updated.endsAt, locale),
  }));

  revalidatePromotions();
  return { ok: true };
}

const rejectSchema = z.object({
  campaignId: z.string().uuid(),
  reason: z.string().trim().min(5, { message: 'reason_too_short' }).max(300),
});

export async function rejectCampaign(
  input: z.input<typeof rejectSchema>,
): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { ok: false, error: message === 'reason_too_short' ? message : 'invalid_input' };
  }

  const [updated] = await db
    .update(campaigns)
    .set({ status: 'rejected', rejectionReason: parsed.data.reason })
    .where(and(eq(campaigns.id, parsed.data.campaignId), eq(campaigns.status, 'requested')))
    .returning({ id: campaigns.id, shopId: campaigns.shopId, slotId: campaigns.slotId });

  if (!updated) return { ok: false, error: 'not_pending' };

  const [slot] = await db
    .select({ name: promotionSlots.name })
    .from(promotionSlots)
    .where(eq(promotionSlots.id, updated.slotId))
    .limit(1);

  await notifyShop(updated.shopId, 'campaign.rejected', (locale) => ({
    slotName: slot ? pickLocale(slot.name, locale) : '',
    reason: parsed.data.reason,
  }));

  revalidatePromotions();
  return { ok: true };
}

/** Ends a running campaign early. The price paid is not refunded here — this is not billing. */
export async function endCampaign(campaignId: string): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(campaigns)
    .set({ status: 'ended' })
    .where(and(eq(campaigns.id, parsed.data), inArray(campaigns.status, ['approved', 'active'])))
    .returning({ id: campaigns.id });

  if (!updated) return { ok: false, error: 'not_running' };

  revalidatePromotions();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Manual creation — the offline sales path                                   */

const manualSchema = z.object({
  slotId: z.string().uuid(),
  shopId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  weeks: z.coerce.number().int().min(1).max(12),
  startsAt: z.string().optional(),
  /** Admin may discount or comp a placement sold face to face. */
  pricePaid: z.coerce.number().int().min(0).max(10_000_000).optional(),
});

/**
 * Admin books a placement on a shop's behalf (PRD §7.3).
 *
 * The offline sales path: a tenant agrees a placement at the management office and
 * never touches the dashboard. This lands ACTIVE or APPROVED directly — there is
 * nobody left to approve it — and the price is overridable, because a deal struck
 * in person may not be list price.
 */
export async function createCampaignForShop(
  input: z.input<typeof manualSchema>,
): Promise<AdminActionResult<{ id: string; pricePaid: number }>> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: 'invalid_input' };
  const endsAt = new Date(startsAt.getTime() + parsed.data.weeks * 7 * 86_400_000);

  const slot = await slotAvailability(parsed.data.slotId, startsAt, endsAt);
  if (!slot) return { ok: false, error: 'slot_not_found' };
  if (slot.available <= 0) return { ok: false, error: 'slot_full' };

  const [shop] = await db
    .select({ id: shops.id, status: shops.status })
    .from(shops)
    .where(eq(shops.id, parsed.data.shopId))
    .limit(1);
  if (!shop) return { ok: false, error: 'shop_not_found' };
  // Promoting a shop that is not public would show a placement leading nowhere.
  if (shop.status !== 'approved') return { ok: false, error: 'shop_not_approved' };

  let productId: string | null = null;
  if (slotNeedsProduct(slot.key)) {
    if (!parsed.data.productId) return { ok: false, error: 'product_required' };
    const [owned] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, parsed.data.productId),
          eq(products.shopId, shop.id),
          eq(products.status, 'published'),
        ),
      )
      .limit(1);
    if (!owned) return { ok: false, error: 'product_not_publishable' };
    productId = owned.id;
  }

  const pricePaid = parsed.data.pricePaid ?? slot.pricePerWeek * parsed.data.weeks;
  const now = new Date();
  const live = startsAt <= now && endsAt >= now;

  const [created] = await db
    .insert(campaigns)
    .values({
      slotId: parsed.data.slotId,
      shopId: shop.id,
      productId,
      status: live ? 'active' : 'approved',
      startsAt,
      endsAt,
      pricePaid,
    })
    .returning({ id: campaigns.id });

  const [slotRow] = await db
    .select({ name: promotionSlots.name })
    .from(promotionSlots)
    .where(eq(promotionSlots.id, parsed.data.slotId))
    .limit(1);

  // The shop still hears about it, or a placement they did not book on the
  // dashboard would look like a bug to them.
  await notifyShop(shop.id, 'campaign.approved', (locale) => ({
    slotName: slotRow ? pickLocale(slotRow.name, locale) : '',
    endsAt: formatDate(endsAt, locale),
  }));

  revalidatePromotions();
  return { ok: true, data: { id: created.id, pricePaid } };
}
