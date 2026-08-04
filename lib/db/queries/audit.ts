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
  /**
   * One subject, by id — "everything we ever decided about پوشاک آریانا".
   *
   * THE DISPUTE-RESOLUTION QUERY (Prompt C12), and the data was already there:
   * every admin action writes its target id, and the page could only ever
   * filter by target TYPE — which answers "show me all shop decisions", a
   * question nobody has. A tenant standing at the counter asking why they were
   * suspended in Jawza needed someone to scroll.
   */
  targetId?: string;
  /** ISO timestamp of the last row on the previous page. */
  before?: string;
  limit?: number;
};

export async function auditEntries(filters: AuditFilters = {}) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const conditions: SQL[] = [];

  if (filters.targetType) conditions.push(eq(adminAuditLog.targetType, filters.targetType));
  if (filters.targetId) conditions.push(eq(adminAuditLog.targetId, filters.targetId));
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

/**
 * The shops this log has anything to say about — the subject filter's options.
 *
 * Read from the LOG rather than from the shops table: a directory of fourteen
 * tenants where nine have never been decided about is a control that mostly
 * does nothing. The label is the one recorded at decision time, so a shop that
 * has since been renamed still reads as it did in the entry.
 */
export async function auditShopOptions() {
  const rows = await db
    .select({
      id: adminAuditLog.targetId,
      label: sql<string>`max(${adminAuditLog.targetLabel})`,
      total: sql<number>`count(*)::int`,
    })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.targetType, 'shop'), sql`${adminAuditLog.targetId} is not null`))
    .groupBy(adminAuditLog.targetId)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  return rows
    .filter((row): row is { id: string; label: string; total: number } => Boolean(row.id))
    .map((row) => ({ ...row, total: Number(row.total) }));
}

/**
 * What the console DECIDED in the last stretch — the queue's done state.
 *
 * An empty action queue used to say only that it was empty, which reads as
 * "nothing happened" rather than "you finished". This is the sentence that
 * turns triage into a completable ritual: «۶ تصمیم در ۲۴ ساعت گذشته».
 *
 * The window is HOURS, not "yesterday": a calendar day boundary in a solar
 * calendar rendered by Intl is a different question from "recently", and the
 * honest thing to say at 09:00 is what has happened since 09:00 yesterday.
 */
export async function auditRecentDecisions(hours: number) {
  const since = new Date(Date.now() - hours * 3_600_000);

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      actors: sql<number>`count(distinct actor_id)::int`,
    })
    .from(adminAuditLog)
    .where(gte(adminAuditLog.createdAt, since));

  return { total: Number(row?.total ?? 0), actors: Number(row?.actors ?? 0) };
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

/**
 * Decision activity over one month — the owners' report's last line.
 *
 * The report says what the mall EARNED; this says what management DID, which is
 * the half a landlord's owners cannot see from a revenue figure. Broken out by
 * the decisions that matter to them — tenants approved, placements sold, papers
 * verified — rather than as a single opaque count of log rows.
 */
export async function auditActivityBetween(start: Date, end: Date) {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      actors: sql<number>`count(distinct actor_id)::int`,
      shopsApproved: sql<number>`count(*) filter (where action = 'shop.approve')::int`,
      verifications: sql<number>`count(*) filter (where action = 'verification.verify')::int`,
      campaigns: sql<number>`count(*) filter (where action in ('campaign.approve', 'campaign.create'))::int`,
    })
    .from(adminAuditLog)
    .where(and(gte(adminAuditLog.createdAt, start), lt(adminAuditLog.createdAt, end)));

  const [row] = rows;
  return {
    total: Number(row?.total ?? 0),
    actors: Number(row?.actors ?? 0),
    shopsApproved: Number(row?.shopsApproved ?? 0),
    verifications: Number(row?.verifications ?? 0),
    campaigns: Number(row?.campaigns ?? 0),
  };
}
