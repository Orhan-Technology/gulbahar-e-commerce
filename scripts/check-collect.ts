import 'dotenv/config';
import { and, eq, sql as raw } from 'drizzle-orm';

import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';
import { db, sql as pg } from '../lib/db';
import { orderEvents, orderItems, orders, products, shops } from '../lib/db/schema';

/**
 * Acceptance check for reserve & collect and the floor map (Prompt C11).
 *
 * C11's three verifications, driven through the SHIPPED actions: a reserve
 * order end to end including the code and the collected transition; stock
 * released when a hold expires; and the map highlighting the right unit from a
 * shop page.
 *
 * Both state changes are UNDONE by id captured first — the order goes back to
 * ready with its original code and expiry, the released stock is put back, and
 * the events this script wrote are deleted. Otherwise the third rehearsal opens
 * on a walkthrough with no hold left to collect.
 */

const SHOPKEEPER = '0700000002';
const CUSTOMER = '0700000003';

/** The staged hold at the demo shop — see scripts/seed.ts. */
const DEMO_HOLD = 'GC-25142';

async function main() {
  const report = createReporter();
  console.log('Reserve & collect (C11)\n');

  const cookie = signIn(SHOPKEEPER);
  const customerCookie = signIn(CUSTOMER);

  const [hold] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      collectionCode: orders.collectionCode,
      holdExpiresAt: orders.holdExpiresAt,
    })
    .from(orders)
    .where(eq(orders.reference, DEMO_HOLD))
    .limit(1);

  if (!hold) throw new Error(`${DEMO_HOLD} is not seeded — run npm run db:reset`);

  // ------------------------------------------------------------ the hold
  report.section('A reserved order carries a code and a window');

  report.check('it is a pickup order', hold.fulfillment === 'pickup');
  report.check('it is ready to collect', hold.status === 'ready');
  report.check('it has a code', Boolean(hold.collectionCode), hold.collectionCode);
  report.check('it has a hold window', Boolean(hold.holdExpiresAt));

  const orderPage = await html(`/fa/account/orders/${DEMO_HOLD}`, customerCookie);
  report.check('the customer sees a collection panel', orderPage.includes('data-collection-panel'));
  report.check(
    'and the code on it is the stored one',
    orderPage.includes(`data-collection-code="${hold.collectionCode}"`),
  );

  /*
   * A DELIVERY order must never grow one. The branch is on the row rather than
   * on the transition, and this is the assertion that keeps it that way.
   */
  const [strays] = await db.execute<{ n: number }>(
    raw`select count(*)::int as n from orders
        where fulfillment = 'delivery' and collection_code is not null`,
  );
  report.check('no delivery order has a collection code', Number(strays.n) === 0, strays);

  // -------------------------------------------------------------- collect
  report.section('Collecting needs the right code');

  const client = await ActionClient.create(
    ['/fa/dashboard/orders', `/fa/dashboard/orders/${hold.id}`],
    cookie,
  );

  const wrong = await client.call(cookie, 'collectOrder', [
    { orderId: hold.id, code: 'ZZZZZ' },
  ]);
  report.check('a wrong code is refused', wrong?.ok === false && wrong?.error === 'code_mismatch', wrong);

  const [stillReady] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, hold.id))
    .limit(1);
  report.check('and the order did not move', stillReady.status === 'ready');

  // The dash the panel renders must not matter — customers read it out.
  const typed = `${hold.collectionCode!.slice(0, 3)}-${hold.collectionCode!.slice(3)}`;
  const collected = await client.call(cookie, 'collectOrder', [
    { orderId: hold.id, code: typed.toLowerCase() },
  ]);
  report.check(
    'the right code, dashed and lower-case, is accepted',
    collected?.ok === true,
    collected,
  );

  const [afterCollect] = await db
    .select({ status: orders.status, holdExpiresAt: orders.holdExpiresAt })
    .from(orders)
    .where(eq(orders.id, hold.id))
    .limit(1);
  report.check('the order is fulfilled', afterCollect.status === 'fulfilled');
  report.check('and the hold window is cleared', afterCollect.holdExpiresAt === null);

  const events = await db
    .select({ note: orderEvents.note, to: orderEvents.toStatus })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, hold.id));
  report.check(
    'the event chain records it as collected',
    events.some((event) => event.to === 'fulfilled' && event.note === 'collected'),
  );

  // Put it back exactly as seeded — including the NOTIFICATION the action
  // wrote. Scoped by event key and recipient, never by "recent": the seed's own
  // notifications carry today's timestamps (CLAUDE.md).
  await db
    .update(orders)
    .set({ status: 'ready', holdExpiresAt: hold.holdExpiresAt })
    .where(eq(orders.id, hold.id));
  await db
    .delete(orderEvents)
    .where(and(eq(orderEvents.orderId, hold.id), eq(orderEvents.note, 'collected')));
  await db.execute(raw`
    delete from notifications
    where event_key = 'order.collected' and payload->>'reference' = ${hold.reference}
  `);

  // --------------------------------------------------------- expired hold
  report.section('An unclaimed hold gives the stock back');

  const [expired] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      collectionCode: orders.collectionCode,
      holdExpiresAt: orders.holdExpiresAt,
      status: orders.status,
      fulfillment: orders.fulfillment,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'ready'),
        eq(orders.fulfillment, 'pickup'),
        raw`orders.hold_expires_at < now()`,
        raw`exists (
          select 1 from order_items oi join shops s on s.id = oi.shop_id
          where oi.order_id = orders.id and s.slug = 'kabul-electronics'
        )`,
      ),
    )
    .limit(1);

  if (!expired) {
    console.log('  ℹ no expired hold seeded at the demo shop — skipping');
  } else {
    const dashboard = await html('/fa/dashboard', cookie);
    report.check('it surfaces in the shopkeeper queue', dashboard.includes('data-expired-holds'));

    const [shop] = await db
      .select({ id: shops.id })
      .from(shops)
      .where(eq(shops.slug, 'kabul-electronics'))
      .limit(1);

    const lines = await db
      .select({ productId: orderItems.productId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, expired.id), eq(orderItems.shopId, shop.id)));

    const before = new Map<string, number>();
    for (const line of lines) {
      if (!line.productId) continue;
      const [row] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);
      before.set(line.productId, row.stock);
    }

    const released = await client.call(cookie, 'releaseExpiredHold', [expired.id]);
    report.check('releasing succeeds', released?.ok === true, released);

    let restoredCorrectly = true;
    for (const line of lines) {
      if (!line.productId) continue;
      const [row] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);
      if (row.stock !== (before.get(line.productId) ?? 0) + line.quantity) restoredCorrectly = false;
    }
    report.check('every unit is back in stock', restoredCorrectly);

    const [afterRelease] = await db
      .select({ status: orders.status, code: orders.collectionCode })
      .from(orders)
      .where(eq(orders.id, expired.id))
      .limit(1);
    report.check('the order is cancelled', afterRelease.status === 'rejected');
    report.check('and its code is gone', afterRelease.code === null);

    // Put the stock, the order and the event back.
    for (const line of lines) {
      if (!line.productId) continue;
      await db
        .update(products)
        .set({ stock: before.get(line.productId) ?? 0 })
        .where(eq(products.id, line.productId));
    }
    await db
      .update(orders)
      .set({
        status: expired.status,
        collectionCode: expired.collectionCode,
        holdExpiresAt: expired.holdExpiresAt,
      })
      .where(eq(orders.id, expired.id));
    await db
      .delete(orderEvents)
      .where(and(eq(orderEvents.orderId, expired.id), eq(orderEvents.note, 'reason:hold_expired')));
    await db.execute(raw`
      delete from notifications
      where event_key = 'order.holdExpired' and payload->>'reference' = ${expired.reference}
    `);
  }

  // A hold still inside its window must NOT be releasable.
  const notExpired = await client.call(cookie, 'releaseExpiredHold', [hold.id]);
  report.check(
    'a live hold cannot be released early',
    notExpired?.ok === false && notExpired?.error === 'not_expired',
    notExpired,
  );

  // -------------------------------------------------------------- the map
  report.section('The floor map');

  const floors = await html('/fa/floors');
  const units = [...floors.matchAll(/data-map-unit="(\d+)"/g)].map((match) => Number(match[1]));
  report.check('units are drawn', units.length > 0, { units: units.length });
  report.check(
    'gaps in the numbering are drawn as empty units',
    floors.includes('data-map-state="vacant"'),
  );

  const [demoShop] = await db
    .select({ unitNumber: shops.unitNumber, floor: shops.floor })
    .from(shops)
    .where(eq(shops.slug, 'kabul-electronics'))
    .limit(1);

  const about = await html('/fa/shops/kabul-electronics?tab=about');
  report.check(
    'the shop page highlights its own unit',
    new RegExp(
      `data-map-unit="${demoShop.unitNumber}"[^>]*data-map-state="highlight"`,
    ).test(about),
  );
  report.check(
    'and exactly one unit is highlighted',
    [...about.matchAll(/data-map-state="highlight"/g)].length === 1,
  );

  report.check(
    'a suspended or pending shop is not on the public map',
    await (async () => {
      const [hidden] = await db.execute<{ n: number }>(
        raw`select count(*)::int as n from shops where status <> 'approved' and floor is not null`,
      );
      if (Number(hidden.n) === 0) return true;
      const [pending] = await db.execute<{ unit: string }>(
        raw`select unit_number as unit from shops
            where status <> 'approved' and unit_number is not null limit 1`,
      );
      return !new RegExp(`data-map-unit="${pending.unit}"[^>]*data-map-state="shop"`).test(floors);
    })(),
  );

  report.check('/floors is public', (await status('/fa/floors')) === 200);

  const failed = report.summary();
  await pg.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await pg.end();
  process.exit(1);
});
