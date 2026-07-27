'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { shopMembers, shops, users } from '../db/schema';
import { notify } from '../notify';

/**
 * Shop registration by the shopkeeper themselves (PRD §13.1).
 *
 * The other onboarding path — admin creates the shop and invites the owner — lives
 * in lib/actions/admin-shops.ts. This one is the self-service route and differs in
 * exactly one way that matters: it lands PENDING, because nobody has vetted it yet.
 *
 * A pending shop can then build its entire catalogue while invisible (PRD §7.1),
 * which is what makes the approval review meaningful and keeps the shopkeeper
 * engaged during the wait.
 *
 * Resubmission is the same action: a rejected application keeps its rejectionReason
 * until the owner saves again, at which point the reason is cleared and the
 * application is fresh in the queue.
 */

export type RegistrationResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const registrationSchema = z.object({
  nameFa: z.string().trim().min(2, { message: 'name_required' }).max(80),
  nameEn: z.string().trim().max(80).optional().nullable(),
  descriptionFa: z.string().trim().max(1200).optional().nullable(),
  categoryId: z.string().uuid().nullable().optional(),
  floor: z.coerce.number().int().min(0).max(10).nullable().optional(),
  unitNumber: z.string().trim().max(20).optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^07\d{8}$/, { message: 'bad_phone' })
    .optional()
    .nullable(),
  /** Canonical ASCII "HH:MM-HH:MM"; see formatOpeningHours in lib/format.ts. */
  hours: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/, { message: 'bad_hours' })
    .optional()
    .nullable(),
});

export type RegistrationInput = z.input<typeof registrationSchema>;

const KNOWN_CODES = new Set(['name_required', 'bad_phone', 'bad_hours']);

function slugify(value: string, suffix: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'shop'}-${suffix}`;
}

export async function registerShop(
  input: RegistrationInput,
): Promise<RegistrationResult<{ shopId: string; slug: string; resubmitted: boolean }>> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };
  // An admin registering a shop for themselves would blur the permission model;
  // they have createShopWithOwner for the tenant-facing case.
  if (user.role === 'admin') return { ok: false, error: 'admin_cannot_register' };

  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { ok: false, error: message && KNOWN_CODES.has(message) ? message : 'invalid_input' };
  }

  const data = parsed.data;

  // Already a member of a shop? Then this is an AMENDMENT, not a new application.
  const [membership] = await db
    .select({ shopId: shopMembers.shopId, role: shopMembers.role })
    .from(shopMembers)
    .where(eq(shopMembers.userId, user.id))
    .limit(1);

  const values = {
    name: { fa: data.nameFa, en: data.nameEn ?? null, ps: null },
    description: data.descriptionFa ? { fa: data.descriptionFa, en: null, ps: null } : null,
    categoryId: data.categoryId ?? null,
    floor: data.floor ?? null,
    unitNumber: data.unitNumber || null,
    phone: data.phone || null,
    hours: data.hours || null,
  };

  if (membership) {
    if (membership.role !== 'owner') return { ok: false, error: 'staff_cannot_register' };

    const [updated] = await db
      .update(shops)
      .set({
        ...values,
        // Clearing the reason is what makes this a fresh submission rather than a
        // shop still sitting in the queue with stale feedback attached.
        rejectionReason: null,
      })
      // Only a pending shop is resubmittable; an approved one edits its profile
      // through the normal profile action instead.
      .where(and(eq(shops.id, membership.shopId), eq(shops.status, 'pending')))
      .returning({ id: shops.id, slug: shops.slug });

    if (!updated) return { ok: false, error: 'already_approved' };

    await notify({
      eventKey: 'shop.submitted',
      recipientUserId: null,
      recipientRole: 'admin',
      values: { shopName: data.nameFa },
    });

    revalidatePath('/dashboard/register-shop');
    revalidatePath('/admin/shops');
    return { ok: true, data: { shopId: updated.id, slug: updated.slug, resubmitted: true } };
  }

  const suffix = Math.random().toString(36).slice(2, 8);
  const [created] = await db
    .insert(shops)
    .values({
      ...values,
      slug: slugify(data.nameEn || data.nameFa, suffix),
      // Self-registered shops are PENDING. This is the whole difference from the
      // admin-created path.
      status: 'pending',
    })
    .returning({ id: shops.id, slug: shops.slug });

  await db.insert(shopMembers).values({ shopId: created.id, userId: user.id, role: 'owner' });

  // A customer who registers a shop becomes a shopkeeper; the session picks the
  // role up on its next refresh.
  if (user.role === 'customer') {
    await db.update(users).set({ role: 'shopkeeper' }).where(eq(users.id, user.id));
  }

  // Lands in the admin queue as a role-addressed notification.
  await notify({
    eventKey: 'shop.submitted',
    recipientUserId: null,
    recipientRole: 'admin',
    values: { shopName: data.nameFa },
  });

  revalidatePath('/dashboard');
  revalidatePath('/admin/shops');
  return { ok: true, data: { shopId: created.id, slug: created.slug, resubmitted: false } };
}
