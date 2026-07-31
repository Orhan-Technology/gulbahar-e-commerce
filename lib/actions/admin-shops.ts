'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db';
import { pickLocale } from '../db/localized';
import { shopMembers, shops, users } from '../db/schema';
import { shopOwnerAndStaff } from '../db/queries/admin';
import { notifyMany } from '../notify';
import { requireAdminContext } from '../admin-context';
import { recordAdminAction } from '../audit';

/**
 * Shop lifecycle, admin side (PRD §7.1).
 *
 * THE PERMISSION BOUNDARY IS THE POINT OF THIS FILE. Admin owns the platform and
 * shops own their content (PRD §3.1), so what admin may do to a shop is exactly:
 * change its STATUS, and create one. There is deliberately no action here that
 * writes a shop's name, description, hours, prices or products — not a filtered
 * one, none at all — so no future edit can widen the boundary by accident.
 *
 * Lifecycle: pending → approved → suspended → closed (PRD §7.1). Approval flips
 * one switch and the shop's published products become publicly visible, because
 * every storefront query already joins on `shops.status = 'approved'`.
 */

export type AdminActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };


/** Storefront surfaces that change the instant a shop's status does. */
function revalidateStorefront(slug: string) {
  revalidatePath('/');
  revalidatePath('/shops');
  revalidatePath(`/shops/${slug}`);
  revalidatePath('/products');
  revalidatePath('/admin/shops');
  revalidatePath(`/admin/shops/${slug}`);
}

/* -------------------------------------------------------------------------- */

export async function approveShop(shopId: string): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(shopId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(shops)
    .set({ status: 'approved', rejectionReason: null })
    // Only a pending or suspended shop can be approved; approving an approved shop
    // would send a second congratulations SMS.
    .where(and(eq(shops.id, parsed.data), inArray(shops.status, ['pending', 'suspended'])))
    .returning({ id: shops.id, slug: shops.slug, name: shops.name });

  if (!updated) return { ok: false, error: 'not_approvable' };

  // Everyone at the shop hears about it, each in their own language.
  const members = await shopOwnerAndStaff(updated.id);
  await notifyMany(
    members.map((member) => ({
      eventKey: 'shop.approved' as const,
      recipientUserId: member.id,
      recipientRole: 'shopkeeper' as const,
      locale: member.locale,
      values: { shopName: pickLocale(updated.name, member.locale) },
    })),
  );

  await recordAdminAction({
    ...context,
    action: 'shop.approve',
    targetType: 'shop',
    targetId: updated.id,
    targetLabel: updated.name.fa,
  });

  revalidateStorefront(updated.slug);
  return { ok: true };
}

const rejectSchema = z.object({
  shopId: z.string().uuid(),
  // A rejection the shopkeeper cannot act on is worse than none: they have to know
  // what to amend before resubmitting (PRD §13.1).
  reason: z.string().trim().min(10, { message: 'reason_too_short' }).max(500),
});

export async function rejectShop(input: z.input<typeof rejectSchema>): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { ok: false, error: message === 'reason_too_short' ? message : 'invalid_input' };
  }

  /*
   * Stays PENDING with a reason attached rather than moving to a rejected state.
   * The shop keeps its catalogue and can amend and resubmit (PRD §13.1); a
   * terminal rejection would force them to start over, and the schema has no
   * 'rejected' shop status precisely because of that.
   */
  const [updated] = await db
    .update(shops)
    .set({ status: 'pending', rejectionReason: parsed.data.reason })
    .where(eq(shops.id, parsed.data.shopId))
    .returning({ id: shops.id, slug: shops.slug, name: shops.name });

  if (!updated) return { ok: false, error: 'not_found' };

  const members = await shopOwnerAndStaff(updated.id);
  await notifyMany(
    members
      .filter((member) => member.role === 'owner')
      .map((member) => ({
        eventKey: 'shop.rejected' as const,
        recipientUserId: member.id,
        recipientRole: 'shopkeeper' as const,
        locale: member.locale,
        values: {
          shopName: pickLocale(updated.name, member.locale),
          reason: parsed.data.reason,
        },
      })),
  );

  await recordAdminAction({
    ...context,
    action: 'shop.reject',
    targetType: 'shop',
    targetId: updated.id,
    targetLabel: updated.name.fa,
    reason: parsed.data.reason,
  });

  revalidateStorefront(updated.slug);
  return { ok: true };
}

const statusSchema = z.object({
  shopId: z.string().uuid(),
  status: z.enum(['suspended', 'closed', 'approved']),
});

/** Suspend, close, or reinstate any shop (PRD §7.1). */
export async function setShopStatus(
  input: z.input<typeof statusSchema>,
): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  // `from` is read before the write so the audit line can say what changed:
  // "approved → suspended" is the fact, "suspended" alone is half of it.
  const [before] = await db
    .select({ status: shops.status, name: shops.name })
    .from(shops)
    .where(eq(shops.id, parsed.data.shopId))
    .limit(1);

  const [updated] = await db
    .update(shops)
    .set({ status: parsed.data.status })
    .where(eq(shops.id, parsed.data.shopId))
    .returning({ slug: shops.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  await recordAdminAction({
    ...context,
    action: 'shop.status',
    targetType: 'shop',
    targetId: parsed.data.shopId,
    targetLabel: before?.name.fa ?? updated.slug,
    detail: { from: before?.status ?? null, to: parsed.data.status },
  });

  revalidateStorefront(updated.slug);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const createSchema = z.object({
  nameFa: z.string().trim().min(2, { message: 'name_required' }).max(80),
  nameEn: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().uuid().nullable().optional(),
  floor: z.coerce.number().int().min(0).max(10).nullable().optional(),
  unitNumber: z.string().trim().max(20).optional().nullable(),
  ownerName: z.string().trim().min(2, { message: 'owner_name_required' }).max(80),
  ownerPhone: z
    .string()
    .trim()
    .regex(/^07\d{8}$/, { message: 'bad_phone' }),
});

const KNOWN_CREATE_CODES = new Set(['name_required', 'owner_name_required', 'bad_phone']);

function slugify(value: string, suffix: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'shop'}-${suffix}`;
}

/**
 * Admin creates a shop and invites its owner to claim it (PRD §7.1, §13.1).
 *
 * Many tenants will ask mall management to set things up, so this path exists and
 * lands the shop APPROVED — admin has already vetted it by definition. The owner
 * is created if that phone has never signed in and receives an invitation; they
 * claim it simply by signing in with that number, since identity here is the phone
 * (PRD §12.2). No separate claim token to lose.
 */
export async function createShopWithOwner(
  input: z.input<typeof createSchema>,
): Promise<AdminActionResult<{ shopId: string; slug: string; ownerCreated: boolean }>> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message && KNOWN_CREATE_CODES.has(message) ? message : 'invalid_input',
    };
  }

  const data = parsed.data;

  const [existingUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.phone, data.ownerPhone))
    .limit(1);

  if (existingUser?.role === 'admin') return { ok: false, error: 'owner_is_admin' };

  // One shop per person in this model, so refuse before creating anything.
  if (existingUser) {
    const [membership] = await db
      .select({ shopId: shopMembers.shopId })
      .from(shopMembers)
      .where(eq(shopMembers.userId, existingUser.id))
      .limit(1);
    if (membership) return { ok: false, error: 'owner_has_shop' };
  }

  let ownerId = existingUser?.id;
  let ownerCreated = false;

  if (!ownerId) {
    const [inserted] = await db
      .insert(users)
      .values({ phone: data.ownerPhone, name: data.ownerName, role: 'shopkeeper' })
      .returning({ id: users.id });
    ownerId = inserted.id;
    ownerCreated = true;
  } else if (existingUser.role === 'customer') {
    await db.update(users).set({ role: 'shopkeeper' }).where(eq(users.id, ownerId));
  }

  const suffix = Math.random().toString(36).slice(2, 8);
  const [created] = await db
    .insert(shops)
    .values({
      slug: slugify(data.nameEn || data.nameFa, suffix),
      name: { fa: data.nameFa, en: data.nameEn ?? null, ps: null },
      // Admin-created shops are approved: the vetting already happened offline.
      status: 'approved',
      categoryId: data.categoryId ?? null,
      floor: data.floor ?? null,
      unitNumber: data.unitNumber || null,
    })
    .returning({ id: shops.id, slug: shops.slug });

  await db.insert(shopMembers).values({ shopId: created.id, userId: ownerId, role: 'owner' });

  const [owner] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  await notifyMany([
    {
      eventKey: 'shop.invited',
      recipientUserId: ownerId,
      recipientRole: 'shopkeeper',
      locale: owner?.locale ?? 'fa',
      values: { shopName: data.nameFa, phone: data.ownerPhone },
    },
  ]);

  await recordAdminAction({
    ...context,
    action: 'shop.create',
    targetType: 'shop',
    targetId: created.id,
    targetLabel: data.nameFa,
    detail: { owner: data.ownerName, phone: data.ownerPhone, ownerCreated: String(ownerCreated) },
  });

  revalidateStorefront(created.slug);
  return { ok: true, data: { shopId: created.id, slug: created.slug, ownerCreated } };
}
