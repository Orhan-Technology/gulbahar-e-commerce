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

/** The filter chips: which target types actually appear, and how often. */
export async function auditTargetCounts() {
  const rows = await db
    .select({ targetType: adminAuditLog.targetType, total: sql<number>`count(*)::int` })
    .from(adminAuditLog)
    .groupBy(adminAuditLog.targetType)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => ({ ...row, total: Number(row.total) }));
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
