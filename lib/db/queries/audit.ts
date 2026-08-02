import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { adminAuditLog } from '../schema';

/**
 * Reading the admin audit log (Prompt C9).
 *
 * KEYSET PAGINATION on `created_at`, not an offset. An audit log only grows and
 * is only ever read newest-first, which is the exact shape offset paging is
 * worst at: page 40 costs the database the first 39 pages of work, and a row
 * written between two clicks shifts every subsequent page by one so an entry
 * can be skipped entirely. A cursor cannot skip a row.
 */

export type AuditFilters = {
  /** `shop`, `user`, `settings`, … — the left-hand column of the page. */
  targetType?: string;
  /** ISO timestamp of the last row on the previous page. */
  before?: string;
  limit?: number;
};

export async function auditEntries(filters: AuditFilters = {}) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const conditions: SQL[] = [];

  if (filters.targetType) conditions.push(eq(adminAuditLog.targetType, filters.targetType));
  if (filters.before) {
    const cursor = new Date(filters.before);
    if (!Number.isNaN(cursor.getTime())) {
      // Interpolating a JS Date into a raw fragment fails with an unreadable
      // "string argument" error — always .toISOString() with an explicit cast
      // (CLAUDE.md). Here drizzle infers the type from the column, so `lt` is
      // safe; the note is for whoever rewrites this as `sql`.
      conditions.push(lt(adminAuditLog.createdAt, cursor));
    }
  }

  const rows = await db
    .select()
    .from(adminAuditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit + 1);

  return {
    entries: rows.slice(0, limit),
    // The extra row is fetched only to answer "is there more", never rendered.
    nextCursor: rows.length > limit ? rows[limit - 1].createdAt.toISOString() : null,
  };
}

/**
 * The reason behind a shop's CURRENT status (PRD §7.1).
 *
 * Suspension and closure record their reason on the audit row rather than on
 * `shops.rejectionReason` — that column belongs to the registration
 * conversation and is cleared on approval (see lib/actions/admin-shops.ts). So
 * the review screen reads it back from the log, which is also what makes the
 * previous suspension still readable after a reinstatement.
 *
 * Newest `shop.status` row only: the reason for the state the shop is in now,
 * not a history. Returns null when the last transition carried none — which is
 * every row written before the reason became mandatory.
 */
export async function latestShopStatusReason(shopId: string) {
  const [row] = await db
    .select({
      reason: adminAuditLog.reason,
      actorName: adminAuditLog.actorName,
      createdAt: adminAuditLog.createdAt,
      detail: adminAuditLog.detail,
    })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.action, 'shop.status'), eq(adminAuditLog.targetId, shopId)))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(1);

  if (!row?.reason) return null;
  return {
    reason: row.reason,
    actorName: row.actorName,
    createdAt: row.createdAt,
    to: (row.detail?.to as string | undefined) ?? null,
  };
}

/** The filter chips: which target types actually appear, and how often. */
export async function auditTargetCounts() {
  const rows = await db
    .select({ targetType: adminAuditLog.targetType, total: sql<number>`count(*)::int` })
    .from(adminAuditLog)
    .groupBy(adminAuditLog.targetType)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/**
 * The log as a flat list, for the CSV export (app/api/reports/admin).
 *
 * A separate function from `auditEntries` rather than a bigger `limit` on it:
 * that one is capped at 200 because it backs a paged screen, and quietly
 * raising the cap for one caller is how a page ends up rendering two thousand
 * rows. An export has a different contract — one file, ordered oldest-last,
 * with a ceiling that is about file size rather than about scrolling.
 */
export async function auditExportRows(targetType: string | undefined, limit = 5000) {
  return db
    .select()
    .from(adminAuditLog)
    .where(targetType ? eq(adminAuditLog.targetType, targetType) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(Math.min(limit, 20_000));
}

/** How busy the console has been — the header line on /admin/audit. */
export async function auditActivity(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      actors: sql<number>`count(distinct actor_id)::int`,
    })
    .from(adminAuditLog)
    .where(gte(adminAuditLog.createdAt, since));

  return { total: Number(row?.total ?? 0), actors: Number(row?.actors ?? 0) };
}
