import 'server-only';

import { db } from './db';
import { adminAuditLog } from './db/schema';

/**
 * Writes one line to the admin audit log (Prompt C9).
 *
 * Called from inside the admin actions, AFTER the write succeeds and never
 * before: a log of attempts is a different thing from a log of decisions, and
 * conflating them means a failed validation reads on the audit page as a
 * suspension that happened.
 *
 * IT NEVER THROWS. An audit write that fails must not turn a completed
 * approval into an error the admin sees, because the approval already
 * happened — the shop is live and the shopkeeper has been notified. Failing
 * loudly here would report a success as a failure and invite someone to do it
 * twice. The failure goes to the server log, which is where an operator can
 * see it.
 *
 * The whole design rests on one habit: every mutating admin action calls this.
 * There is no interceptor and no proxy that could enforce it, so the check
 * script asserts it instead (scripts/check-admin.ts drives each action and
 * looks for its row).
 */
export type AuditAction =
  | 'shop.approve'
  | 'shop.reject'
  | 'shop.status'
  | 'shop.create'
  | 'shop.nudge'
  | 'verification.verify'
  | 'verification.reject'
  | 'verification.claim'
  | 'product.unpublish'
  | 'review.moderate'
  | 'category.save'
  | 'category.delete'
  | 'category.reorder'
  | 'user.role'
  | 'user.active'
  | 'campaign.approve'
  | 'campaign.reject'
  | 'campaign.end'
  | 'campaign.create'
  | 'slot.update'
  | 'settings.update'
  | 'settings.locales';

export type AuditTargetType =
  | 'shop'
  | 'product'
  | 'review'
  | 'category'
  | 'user'
  | 'campaign'
  | 'slot'
  | 'order'
  | 'settings';

export async function recordAdminAction(entry: {
  actorId: string;
  actorName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  targetLabel?: string | null;
  reason?: string | null;
  detail?: Record<string, string | number | null>;
}): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      actorId: entry.actorId,
      actorName: entry.actorName,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      reason: entry.reason ?? null,
      detail: entry.detail ?? null,
    });
  } catch (error) {
    console.error('[audit] failed to record', entry.action, error);
  }
}
