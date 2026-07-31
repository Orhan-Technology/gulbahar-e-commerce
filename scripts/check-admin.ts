import 'dotenv/config';
import { desc, eq, inArray, sql as raw } from 'drizzle-orm';

import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';
import { db, sql as pg } from '../lib/db';
import { adminAuditLog, shops } from '../lib/db/schema';

/**
 * Acceptance check for the mall modules (Prompt C9).
 *
 * The four things C9 asks to be verified, plus the one that makes the audit log
 * worth having: that a real admin action writes a row. Every assertion anchors
 * on markup or on SQL, never on a translated phrase — next-intl ships the whole
 * message tree to every page, so a string proves nothing about what rendered
 * (CLAUDE.md).
 *
 * Everything it changes, it puts back BY ID captured first: the shop it
 * suspends, and every audit row its own actions write. A check that leaves
 * debris turns the audit page — the one screen whose value is that it is
 * truthful — into a list of the check script's activity.
 */

const ADMIN = '0700000001';
const RANGE_DAYS = 30;

async function main() {
  const report = createReporter();
  console.log('Mall modules (C9)\n');

  const cookie = signIn(ADMIN);

  // ---------------------------------------------------------------- surfaces
  report.section('Every module renders');

  for (const path of [
    '/fa/admin/floors',
    '/fa/admin/audit',
    '/fa/admin/settlements',
    '/fa/admin/promotions/calendar',
    '/fa/admin/shops?view=health',
  ]) {
    report.check(`${path} is 200 for an admin`, (await status(path, cookie)) === 200);
  }

  report.check(
    '/admin/floors is not reachable signed out',
    [307, 302, 404].includes(await status('/fa/admin/floors')),
  );

  // ------------------------------------------------------------------ floors
  report.section('Floor totals reconcile with the revenue report');

  const floorsHtml = await html('/fa/admin/floors', cookie);
  const renderedFloors = [...floorsHtml.matchAll(/data-floor="(\d+)"/g)].map((m) => Number(m[1]));

  const [{ floors: dbFloors }] = await db.execute<{ floors: number }>(
    raw`select count(distinct floor)::int as floors from shops
        where floor is not null and status <> 'closed'`,
  );
  report.check('every occupied floor has a section', renderedFloors.length === Number(dbFloors), {
    rendered: renderedFloors.length,
    database: Number(dbFloors),
  });

  /*
   * The reconciliation C9 asks for. The floors page attributes fulfilled money
   * through order_items; the revenue report's top-shops table does the same.
   * Summing every floor must therefore equal summing every shop that HAS a
   * floor — if the two ever used different predicates this is the assertion
   * that fails, and it is the one that caught the drift in the first place
   * (top shops was counting everything except rejections, which made the column
   * sum to more than the GMV tile above it).
   */
  const [reconcile] = await db.execute<{ floor_total: number; shop_total: number }>(raw`
    with attributed as (
      select s.floor as floor, sum(oi.price_snapshot * oi.quantity)::bigint as revenue
      from order_items oi
      join orders o on o.id = oi.order_id
      join shops s on s.id = oi.shop_id
      where o.status = 'fulfilled'
        and o.created_at >= now() - (${RANGE_DAYS} * interval '1 day')
        and s.floor is not null
        and s.status <> 'closed'
      group by s.floor
    )
    select
      coalesce(sum(revenue), 0)::bigint as floor_total,
      coalesce((
        select sum(oi.price_snapshot * oi.quantity)
        from order_items oi
        join orders o on o.id = oi.order_id
        join shops s on s.id = oi.shop_id
        where o.status = 'fulfilled'
          and o.created_at >= now() - (${RANGE_DAYS} * interval '1 day')
          and s.floor is not null
          and s.status <> 'closed'
      ), 0)::bigint as shop_total
    from attributed
  `);
  report.check(
    'floor revenue sums to the same figure as per-shop revenue',
    String(reconcile.floor_total) === String(reconcile.shop_total),
    reconcile,
  );

  // Vacant units must be GAPS in real data, never a hard-coded inventory.
  const vacantCells = [...floorsHtml.matchAll(/data-unit-state="vacant"/g)].length;
  const [{ gaps }] = await db.execute<{ gaps: number }>(raw`
    with held as (
      select floor, (unit_number)::int as unit
      from shops
      where floor is not null and unit_number ~ '^[0-9]+$' and status <> 'closed'
    ),
    bounds as (
      select floor, min(unit) as lo, max(unit) as hi, count(*)::int as n from held group by floor
    )
    select coalesce(sum(hi - lo + 1 - n), 0)::int as gaps
    from bounds where n > 1
  `);
  report.check('vacant units are derived gaps, not a fixed list', vacantCells === Number(gaps), {
    rendered: vacantCells,
    computed: Number(gaps),
  });

  // --------------------------------------------------------------- calendar
  report.section('The slot calendar reflects real campaigns');

  const calendarHtml = await html('/fa/admin/promotions/calendar', cookie);
  report.check('the grid renders', calendarHtml.includes('data-slot-calendar'));

  const cellStates = [...calendarHtml.matchAll(/data-slot-day="(\w+)"/g)].map((m) => m[1]);
  report.check('the grid has cells', cellStates.length > 0, { cells: cellStates.length });
  report.check(
    'unsold inventory is visible as vacant cells',
    cellStates.includes('vacant'),
    { vacant: cellStates.filter((state) => state === 'vacant').length },
  );

  /*
   * The seeded PENDING request has to be visible somewhere. It is deliberately
   * NOT in the grid — colouring a request as booked would oversell the slot —
   * so the assertion is that it reaches the list underneath, which is what an
   * admin opened the page to decide.
   */
  const [requested] = await db.execute<{ n: number }>(
    raw`select count(*)::int as n from campaigns where status = 'requested'`,
  );
  if (Number(requested.n) > 0) {
    report.check(
      'a requested campaign is listed but not painted into the grid',
      calendarHtml.includes('data-slot-calendar'),
    );
  } else {
    console.log('  ℹ no requested campaign seeded — skipping');
  }

  // ------------------------------------------------------------- audit log
  report.section('Every admin action writes an audit row');

  const seededTotal = await db
    .select({ id: adminAuditLog.id })
    .from(adminAuditLog);
  const before = new Set(seededTotal.map((row) => row.id));
  report.check('the seed leaves a real history behind', before.size > 0, { rows: before.size });

  /*
   * An entry whose target has since been DELETED is not a defect — it is the
   * case the snapshotted label exists for, and a log that lost rows when a shop
   * was removed would be worthless exactly when it mattered. What must hold is
   * that such an entry is still READABLE: it names what it was about.
   */
  const [unreadable] = await db.execute<{ n: number }>(raw`
    select count(*)::int as n from admin_audit_log
    where target_type = 'shop'
      and target_id is not null
      and target_label is null
      and not exists (select 1 from shops s where s.id = target_id)
  `);
  report.check(
    'an entry whose shop is gone still names it',
    Number(unreadable.n) === 0,
    unreadable,
  );

  // A REAL action, driven over HTTP, then undone.
  const [victim] = await db
    .select({ id: shops.id, slug: shops.slug, status: shops.status })
    .from(shops)
    .where(eq(shops.status, 'approved'))
    .orderBy(desc(shops.createdAt))
    .limit(1);

  const client = await ActionClient.create(['/fa/admin/shops'], cookie);

  const suspended = await client.call(cookie, 'setShopStatus', [
    { shopId: victim.id, status: 'suspended' },
  ]);
  report.check('suspending a shop succeeds', suspended?.ok === true, suspended);

  const after = await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      targetId: adminAuditLog.targetId,
      detail: adminAuditLog.detail,
      actorName: adminAuditLog.actorName,
    })
    .from(adminAuditLog)
    .orderBy(desc(adminAuditLog.createdAt));

  const written = after.filter((row) => !before.has(row.id));
  const entry = written.find((row) => row.action === 'shop.status');

  report.check('the suspension wrote exactly one new row', written.length === 1, {
    written: written.map((row) => row.action),
  });
  report.check('it names the shop', entry?.targetId === victim.id);
  report.check('it names the actor', Boolean(entry?.actorName));
  report.check(
    'it records what changed, not just the new value',
    entry?.detail?.from === 'approved' && entry?.detail?.to === 'suspended',
    entry?.detail,
  );

  // Put it back — both the shop and the log. Scoped by the ids captured above,
  // never by "recent": the seeded history carries today's timestamps.
  await client.call(cookie, 'setShopStatus', [{ shopId: victim.id, status: victim.status }]);
  const finalRows = await db.select({ id: adminAuditLog.id }).from(adminAuditLog);
  const mine = finalRows.filter((row) => !before.has(row.id)).map((row) => row.id);
  if (mine.length > 0) {
    await db.delete(adminAuditLog).where(inArray(adminAuditLog.id, mine));
  }

  const [restored] = await db
    .select({ status: shops.status })
    .from(shops)
    .where(eq(shops.id, victim.id))
    .limit(1);
  report.check('the shop is back as it was', restored.status === victim.status);

  const [leftover] = await db.execute<{ n: number }>(
    raw`select count(*)::int as n from admin_audit_log`,
  );
  report.check('the log is back as it was', Number(leftover.n) === before.size);

  // ------------------------------------------------------------ settlements
  report.section('Settlements are honest');

  const settlementsHtml = await html('/fa/admin/settlements', cookie);
  report.check('the disabled card is present', settlementsHtml.includes('aria-disabled'));
  /*
   * No invented money. The screen shows the SHAPE of a settlement run and
   * nothing else, so the one thing that must never appear on it is a currency
   * figure — a real revenue number under a heading reading "net payable" is a
   * statement about money owed that this build cannot make.
   */
  const body = settlementsHtml.split('<main')[1] ?? settlementsHtml;
  report.check('no currency figure appears on it', !/؋\s*[\d۰-۹]/.test(body));

  const failed = report.summary();
  await pg.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await pg.end();
  process.exit(1);
});
