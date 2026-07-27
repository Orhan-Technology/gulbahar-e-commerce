'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { shopMembers, users } from '../db/schema';
import { shopNameFor } from '../db/queries/shop-orders';
import { notify } from '../notify';

/**
 * Shop settings: staff and language (PRD §6.8).
 *
 * Only the OWNER may manage staff. Membership is a real join table
 * (shop_members, PRD §14) precisely so this is a row-level decision rather than a
 * flag on the user, and the owner check reads that table instead of trusting the
 * session's shopId alone.
 *
 * Notification preferences are UI state for the demo (PRD §15: real preferences
 * ship with the real SMS gateway), so there is no action for them here — a
 * settings action that persisted nothing would be worse than an honest local
 * toggle.
 */

export type SettingsResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

/** Resolves the caller AND their membership role in one query. */
async function requireOwner() {
  const user = await currentUser();
  if (!user?.id || !user.shopId || user.role !== 'shopkeeper') return null;

  const [membership] = await db
    .select({ role: shopMembers.role })
    .from(shopMembers)
    .where(and(eq(shopMembers.shopId, user.shopId), eq(shopMembers.userId, user.id)))
    .limit(1);

  if (membership?.role !== 'owner') return null;
  return { userId: user.id, shopId: user.shopId };
}

const staffSchema = z.object({
  name: z.string().trim().min(2, { message: 'name_required' }).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^07\d{8}$/, { message: 'bad_phone' }),
});

/**
 * Adds a staff member by phone (PRD §6.8).
 *
 * Creates the user if that number has never signed in — which is the normal case,
 * since staff are added before their first login and identity here is the phone
 * number (PRD §12.2). An existing CUSTOMER is promoted to shopkeeper; an existing
 * admin is refused, because demoting a platform admin into a shop would be a
 * privilege change in the wrong direction.
 */
export async function addStaff(
  input: z.input<typeof staffSchema>,
): Promise<SettingsResult<{ userId: string; created: boolean }>> {
  const context = await requireOwner();
  if (!context) return { ok: false, error: 'owner_only' };

  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message === 'name_required' || message === 'bad_phone' ? message : 'invalid_input',
    };
  }

  const { name, phone } = parsed.data;

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existing?.role === 'admin') return { ok: false, error: 'is_admin' };

  let userId = existing?.id;
  let created = false;

  if (!userId) {
    const [inserted] = await db
      .insert(users)
      .values({ phone, name, role: 'shopkeeper' })
      .returning({ id: users.id });
    userId = inserted.id;
    created = true;
  } else if (existing.role === 'customer') {
    await db.update(users).set({ role: 'shopkeeper' }).where(eq(users.id, userId));
  }

  // Already a member of ANOTHER shop? A person works at one shop in this model,
  // and silently moving them would take them off the other shop's roster.
  const [otherMembership] = await db
    .select({ shopId: shopMembers.shopId })
    .from(shopMembers)
    .where(eq(shopMembers.userId, userId))
    .limit(1);

  if (otherMembership && otherMembership.shopId !== context.shopId) {
    return { ok: false, error: 'already_in_shop' };
  }
  if (otherMembership) return { ok: false, error: 'already_member' };

  await db.insert(shopMembers).values({ shopId: context.shopId, userId, role: 'staff' });

  const shop = await shopNameFor(context.shopId);
  await notify({
    eventKey: 'shop.invited',
    recipientUserId: userId,
    recipientRole: 'shopkeeper',
    values: {
      shopName: shop ? pickLocale(shop.name, 'fa') : '',
      phone,
    },
  });

  revalidatePath('/dashboard/settings');
  return { ok: true, data: { userId, created } };
}

/** Removes a staff member. The owner cannot remove themselves. */
export async function removeStaff(userId: string): Promise<SettingsResult> {
  const context = await requireOwner();
  if (!context) return { ok: false, error: 'owner_only' };

  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  if (parsed.data === context.userId) return { ok: false, error: 'cannot_remove_self' };

  const [removed] = await db
    .delete(shopMembers)
    .where(
      and(
        eq(shopMembers.shopId, context.shopId),
        eq(shopMembers.userId, parsed.data),
        // Owners are not removable through this path at all.
        eq(shopMembers.role, 'staff'),
      ),
    )
    .returning({ userId: shopMembers.userId });

  if (!removed) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard/settings');
  return { ok: true };
}

/** The signed-in user's own interface language (PRD §6.8). */
export async function setDashboardLocale(locale: 'fa' | 'en' | 'ps'): Promise<SettingsResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = z.enum(['fa', 'en', 'ps']).safeParse(locale);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  /*
   * Stored on the user, which is what notify() reads when choosing a template
   * language — so changing it here also changes the language of the SMS this
   * person receives, not just the interface.
   */
  await db.update(users).set({ locale: parsed.data }).where(eq(users.id, user.id));

  revalidatePath('/dashboard/settings');
  return { ok: true };
}
