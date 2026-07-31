import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { notificationCategory } from '../../notification-links';
import { notifications, users, type NotificationChannel, type UserRole } from '../schema';

export type NotificationFeedFilters = {
  channel?: NotificationChannel;
  role?: UserRole;
  limit?: number;
};

/**
 * Feed for the demo notification log panel (PRD §9.2).
 *
 * Newest first, joined to the recipient so the panel can show name and role —
 * the point of the panel is that the client watches a specific person's SMS
 * arrive, not an anonymous row.
 */
export async function notificationFeed(filters: NotificationFeedFilters = {}) {
  const conditions: SQL[] = [];
  if (filters.channel) conditions.push(eq(notifications.channel, filters.channel));
  if (filters.role) conditions.push(eq(notifications.recipientRole, filters.role));

  return db
    .select({
      id: notifications.id,
      channel: notifications.channel,
      locale: notifications.locale,
      title: notifications.title,
      body: notifications.body,
      eventKey: notifications.eventKey,
      payload: notifications.payload,
      read: notifications.read,
      createdAt: notifications.createdAt,
      recipientRole: notifications.recipientRole,
      recipientUserId: notifications.recipientUserId,
      recipientName: users.name,
      recipientPhone: users.phone,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.recipientUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    // Id as tiebreaker: seeded rows share a createdAt second, and an unstable
    // order makes the polling panel visibly reshuffle between identical polls.
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(filters.limit ?? 60);
}

/**
 * Notifications for one user, plus anything addressed to their role at large
 * (e.g. the admin queue). Drives every bell and the /notifications page.
 *
 * NO CHANNEL FILTER, and that is the change C12 turns on. `channel` records how
 * a message WOULD have been delivered, not whether it is the recipient's to
 * read — and in this build nothing is ever really sent, so filtering to
 * `inapp` hid almost every order event from the customer whose order it was
 * while the demo log showed it. The two must never disagree (C12's own
 * verification), so the bell reads everything addressed to the person.
 *
 * SIGN-IN CODES ARE EXCLUDED. An OTP has already done its job by the time it
 * could appear in a list, and a standing list of live-looking codes is noise at
 * best. The demo log still shows them, because reading one out is how the
 * presenter signs in.
 */
const READABLE = sql`${notifications.eventKey} not in ('otp', 'email.verify')`;

export async function userNotifications(userId: string, role: UserRole, limit = 30) {
  return db
    .select({
      id: notifications.id,
      channel: notifications.channel,
      title: notifications.title,
      body: notifications.body,
      eventKey: notifications.eventKey,
      payload: notifications.payload,
      read: notifications.read,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        READABLE,
        or(
          eq(notifications.recipientUserId, userId),
          and(isNull(notifications.recipientUserId), eq(notifications.recipientRole, role)),
        ),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string, role: UserRole) {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(
      and(
        READABLE,
        eq(notifications.read, false),
        or(
          eq(notifications.recipientUserId, userId),
          and(isNull(notifications.recipientUserId), eq(notifications.recipientRole, role)),
        ),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return;
  await db.update(notifications).set({ read: true }).where(inArray(notifications.id, ids));
}

/** Clear-read action on the log panel (PRD §9.2). */
export async function markAllRead() {
  await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
}

/**
 * The /notifications history, filtered by category (Prompt C12).
 *
 * Category is derived from the event key rather than stored, so the filter
 * needs no migration and no backfill — the same derivation the panel and the
 * preferences use (lib/notification-links.ts). Filtering happens in JS on a
 * bounded page rather than in SQL, because expressing the mapping twice is how
 * a filter and a badge end up disagreeing.
 */
export async function notificationHistory(
  userId: string,
  role: UserRole,
  options: { category?: string; limit?: number } = {},
) {
  const rows = await userNotifications(userId, role, options.limit ?? 100);
  if (!options.category) return rows;
  return rows.filter((row) => notificationCategory(row.eventKey) === options.category);
}

/** How many of each category the person has, for the filter chips. */
export async function notificationCategoryCounts(userId: string, role: UserRole) {
  const rows = await userNotifications(userId, role, 200);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const category = notificationCategory(row.eventKey);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

/** Marks read only what belongs to this person — never the whole table. */
export async function markMineRead(userId: string, role: UserRole, ids?: string[]) {
  const mine = or(
    eq(notifications.recipientUserId, userId),
    and(isNull(notifications.recipientUserId), eq(notifications.recipientRole, role)),
  );

  await db
    .update(notifications)
    .set({ read: true })
    .where(
      ids && ids.length > 0
        ? and(mine, inArray(notifications.id, ids))
        : and(mine, eq(notifications.read, false)),
    );
}

/** The stored preferences, or null when the account has never changed them. */
export async function notificationPreferences(userId: string) {
  const [row] = await db
    .select({ prefs: users.notificationPrefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.prefs ?? null;
}
