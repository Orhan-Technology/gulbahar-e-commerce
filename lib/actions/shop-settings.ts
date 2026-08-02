'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { shopMembers, shops, users } from '../db/schema';
import { shopNameFor } from '../db/queries/shop-orders';
import { notify } from '../notify';
import { MAX_PAUSE_DAYS } from '../pause';

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

/* -------------------------------------------------------------------------- */
/* Vacation mode                                                              */

/**
 * Ownership in the WHERE clause, the same idiom as every other shop write
 * (lib/actions/shop-products.ts): the shop id comes from the session and is part
 * of the predicate that finds the row, so a forged id cannot reach another
 * tenant's shop. Distinct from `requireOwner` above, which additionally reads
 * the membership row — staff answer the phone and lock up, and closing for the
 * week is within that.
 */
async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId || user.role !== 'shopkeeper') return null;
  return { userId: user.id, shopId: user.shopId };
}

/**
 * The date arrives as `YYYY-MM-DD` from an `<input type="date">` and means "I am
 * back ON that day", so the pause runs to the END of the day BEFORE it — in the
 * MALL's timezone, not the server's. Kabul is +04:30, and a half-hour offset is
 * exactly what a hand-rolled hours calculation gets wrong (lib/opening.ts).
 */
function endOfMallDay(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T23:59:59.999+04:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const pauseSchema = z.object({
  /** Last day the shop stays shut, inclusive. */
  until: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'bad_pause_date' }),
  /** Optional line customers read on the shop page, in the shop's own words. */
  noteFa: z.string().trim().max(200).optional().nullable(),
  noteEn: z.string().trim().max(200).optional().nullable(),
});

export type PauseShopInput = z.input<typeof pauseSchema>;

/**
 * Closes the shop until a date (Prompt: vacation mode).
 *
 * A PAST DATE IS REFUSED rather than accepted-and-ignored. Storing one would
 * write a pause that is already over, the banner would appear and vanish on the
 * next render, and the shopkeeper would be left believing their shop was shut
 * while it kept taking orders — the single worst outcome this feature can
 * produce, and the reason it is a validation error with its own message.
 */
export async function pauseShop(input: PauseShopInput): Promise<SettingsResult<{ until: string }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = pauseSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { ok: false, error: message === 'bad_pause_date' ? message : 'invalid_input' };
  }

  const until = endOfMallDay(parsed.data.until);
  if (!until) return { ok: false, error: 'bad_pause_date' };

  const now = new Date();
  if (until.getTime() <= now.getTime()) return { ok: false, error: 'pause_date_past' };
  if (until.getTime() - now.getTime() > MAX_PAUSE_DAYS * 86_400_000) {
    return { ok: false, error: 'pause_too_far' };
  }

  const noteFa = parsed.data.noteFa?.trim();
  const [updated] = await db
    .update(shops)
    .set({
      pausedUntil: until,
      // No Dari line means no note at all: an en-only note would render as an
      // empty string to the readers who are the default audience.
      pauseNote: noteFa ? { fa: noteFa, en: parsed.data.noteEn?.trim() || null, ps: null } : null,
    })
    .where(eq(shops.id, context.shopId))
    .returning({ slug: shops.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath(`/shops/${updated.slug}`);
  revalidatePath('/shops');
  return { ok: true, data: { until: until.toISOString() } };
}

/** Back to trading, now — and it also clears the note, which was about the gap. */
export async function resumeShop(): Promise<SettingsResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const [updated] = await db
    .update(shops)
    .set({ pausedUntil: null, pauseNote: null })
    .where(eq(shops.id, context.shopId))
    .returning({ slug: shops.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath(`/shops/${updated.slug}`);
  revalidatePath('/shops');
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
