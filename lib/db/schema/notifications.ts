import { boolean, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, localeEnum, notificationChannelEnum, userRoleEnum } from './shared';
import { users } from './users';

/**
 * Source of truth for the on-screen notification log (PRD §9.2, §14).
 *
 * Every message the system *would* send is a row here — OTPs, order lifecycle,
 * review responses, campaign decisions, shop approvals. The log panel reads
 * this table, so the demo shows an SMS arriving the moment an order is
 * accepted, which demos better than real SMS.
 *
 * Title and body are rendered at write time rather than stored as a template
 * reference, so the panel can display the exact text in the recipient's own
 * language without re-resolving translations at read time.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Broad audience for role-targeted messages (e.g. "admin queue"). */
    recipientRole: userRoleEnum('recipient_role').notNull(),
    /** Null when the message targets a role rather than one person. */
    recipientUserId: uuid('recipient_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    channel: notificationChannelEnum('channel').notNull(),
    locale: localeEnum('locale').notNull().default('fa'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Stable key identifying the template, e.g. 'order.accepted', 'otp'. */
    eventKey: text('event_key').notNull(),
    /** Context for deep-linking from the log, e.g. { orderId, reference }. */
    payload: jsonb('payload').$type<Record<string, string | number>>(),
    read: boolean('read').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index('notifications_recipient_idx').on(table.recipientUserId, table.read),
    index('notifications_created_idx').on(table.createdAt),
    index('notifications_role_idx').on(table.recipientRole, table.read),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
