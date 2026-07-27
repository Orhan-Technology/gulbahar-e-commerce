import { and, count, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';

import { db } from '..';
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
 * In-app notifications for one user, plus anything addressed to their role at
 * large (e.g. the admin queue). Drives the dashboard and admin bells.
 */
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
        eq(notifications.channel, 'inapp'),
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
        eq(notifications.channel, 'inapp'),
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
