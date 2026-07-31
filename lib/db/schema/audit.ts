import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt } from './shared';
import { users } from './users';

/**
 * Every decision an admin makes (Prompt C9).
 *
 * A mall has staff. The moment a second person can approve a shop, suspend a
 * tenant or change the delivery fee, "who did this and why" stops being a
 * curiosity and becomes the first question asked when something is wrong. This
 * table is what makes that answerable, and it is cheap: one insert inside the
 * actions that were already writing.
 *
 * APPEND-ONLY BY CONVENTION, and the convention is load-bearing. There is no
 * update or delete path anywhere in the codebase — a log that can be edited by
 * the people it logs is decoration. It is also why `targetLabel` is a SNAPSHOT
 * rather than a join: the row it names may be renamed or deleted afterwards,
 * and "suspended (deleted shop)" tells nobody anything.
 *
 * `actorId` is nullable and set null on delete so removing a staff account
 * cannot take their decisions with it; `actorName` is the same snapshot idea
 * applied to the person.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** Snapshotted, so a deleted or renamed account does not erase the trail. */
    actorName: text('actor_name').notNull(),
    /**
     * What happened, as a stable dotted key — `shop.approve`, `review.hide`,
     * `settings.update`. A key rather than a sentence because it is filtered
     * on, counted, and translated; the sentence is in the messages file.
     */
    action: text('action').notNull(),
    /** `shop` | `product` | `review` | `user` | `campaign` | `settings` | … */
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    /** The target's name AT THE TIME — see the note above. */
    targetLabel: text('target_label'),
    /** Free text the admin typed: a rejection reason, a suspension note. */
    reason: text('reason'),
    /** Anything else worth keeping, e.g. `{ from: 'pending', to: 'approved' }`. */
    detail: jsonb('detail').$type<Record<string, string | number | null>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index('admin_audit_created_idx').on(table.createdAt),
    index('admin_audit_action_idx').on(table.action),
    index('admin_audit_target_idx').on(table.targetType, table.targetId),
  ],
);

export type AdminAuditEntry = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditEntry = typeof adminAuditLog.$inferInsert;
