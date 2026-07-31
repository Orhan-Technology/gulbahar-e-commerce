'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { markMineRead, notificationPreferences } from '../db/queries/notifications';
import { users } from '../db/schema';

/**
 * Reading and muting notifications (Prompt C12).
 *
 * SCOPED TO THE CALLER, always. The demo panel's `markAllRead()` clears the
 * whole table because it is a presenter's reset button; these two never touch a
 * row addressed to somebody else, and the scoping lives in the query rather
 * than in a filter the caller passes (lib/db/queries/notifications.ts).
 */

export type NotificationResult = { ok: true } | { ok: false; error: string };

export async function markNotificationRead(id: string): Promise<NotificationResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  await markMineRead(user.id, user.role, [parsed.data]);
  revalidatePath('/notifications');
  return { ok: true };
}

export async function markAllMineRead(): Promise<NotificationResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  await markMineRead(user.id, user.role);
  revalidatePath('/notifications');
  revalidatePath('/account');
  return { ok: true };
}

const preferencesSchema = z.object({
  category: z.enum(['orders', 'reviews', 'questions', 'promotions', 'shops']),
  enabled: z.boolean(),
});

/**
 * Mutes or unmutes one category.
 *
 * MERGES rather than replaces, and only ever records what has been turned OFF.
 * Writing the whole object would mean a category added later defaults to muted
 * for anyone who has ever opened this screen and to on for everyone else — the
 * same feature behaving differently depending on when you signed up.
 *
 * The mute is honoured at WRITE time, in notify(), not by hiding rows at read
 * time: a notification you asked not to receive should not exist, and one that
 * exists but is hidden would still turn up in the demo log and contradict the
 * bell (C12's own rule).
 */
export async function setNotificationPreference(
  input: z.input<typeof preferencesSchema>,
): Promise<NotificationResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const existing = (await notificationPreferences(user.id)) ?? {};
  const next: Record<string, boolean> = { ...existing };

  if (parsed.data.enabled) delete next[parsed.data.category];
  else next[parsed.data.category] = false;

  await db
    .update(users)
    .set({ notificationPrefs: Object.keys(next).length > 0 ? next : null })
    .where(eq(users.id, user.id));

  revalidatePath('/account/settings');
  return { ok: true };
}
