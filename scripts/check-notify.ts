import 'dotenv/config';
import { desc, eq, sql as raw } from 'drizzle-orm';

import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';
import { db, sql as pg } from '../lib/db';
import { notifications, orders, users } from '../lib/db/schema';
import { notificationCategory, notificationHref } from '../lib/notification-links';

/**
 * Acceptance check for the notification centre (Prompt C12).
 *
 * The three things C12 asks to be verified: accepting an order as a shopkeeper
 * produces a customer notification that deep-links to the order; unread counts
 * are per user and correct after reads; and the demo log and the bells never
 * disagree.
 *
 * The order it advances is put BACK — status, event and notification — by ids
 * captured first. Read state that this script changes is restored too, because
 * a bell that opens with no count is a walkthrough with nothing to point at.
 */

const SHOPKEEPER = '0700000002';
const CUSTOMER = '0700000003';
const ADMIN = '0700000001';

async function main() {
  const report = createReporter();
  console.log('Notification centre (C12)\n');

  const shopCookie = signIn(SHOPKEEPER);
  const customerCookie = signIn(CUSTOMER);
  const adminCookie = signIn(ADMIN);

  // ------------------------------------------------------------- surfaces
  report.section('Every signed-in surface has a bell');

  for (const [label, cookie, path] of [
    ['storefront', customerCookie, '/fa'],
    ['shop panel', shopCookie, '/fa/dashboard'],
    ['mall console', adminCookie, '/fa/admin'],
  ] as const) {
    const body = await html(path, cookie);
    report.check(`${label} renders a bell`, /data-notification-bell="\d+"/.test(body));
  }

  const signedOut = await html('/fa');
  report.check('a signed-out visitor gets no bell', !signedOut.includes('data-notification-bell'));

  report.check(
    '/notifications is behind a sign-in',
    [307, 302].includes(await status('/fa/notifications')),
  );

  for (const [label, cookie] of [
    ['customer', customerCookie],
    ['shopkeeper', shopCookie],
    ['admin', adminCookie],
  ] as const) {
    report.check(
      `a ${label} can open their own history`,
      (await status('/fa/notifications', cookie)) === 200,
    );
  }

  // ------------------------------------------------- the log and the bells
  report.section('The demo log and the bells never disagree');

  const [customer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, CUSTOMER))
    .limit(1);

  /*
   * The bell shows everything addressed to the person, whatever channel it
   * would have gone out on. Before C12 it filtered to `inapp`, which hid almost
   * every order event from the customer whose order it was while the demo log
   * showed it — the exact disagreement this section exists to catch.
   */
  const [mine] = await db.execute<{ total: number; sms: number }>(raw`
    select count(*)::int as total,
           count(*) filter (where channel = 'sms')::int as sms
    from notifications
    where recipient_user_id = ${customer.id}
      and event_key not in ('otp', 'email.verify')
  `);

  const history = await html('/fa/notifications', customerCookie);
  const rendered = [...history.matchAll(/data-notification="(read|unread)"/g)].length;

  report.check(
    'the history shows every message addressed to them',
    rendered === Number(mine.total),
    { rendered, database: Number(mine.total) },
  );
  report.check(
    'including the ones that would have gone by SMS',
    Number(mine.sms) > 0 && rendered >= Number(mine.sms),
    { sms: Number(mine.sms) },
  );

  // ------------------------------------------------------------ deep links
  report.section('Every notification opens the thing it is about');

  const rows = await db
    .select({ eventKey: notifications.eventKey, payload: notifications.payload })
    .from(notifications)
    .where(eq(notifications.recipientUserId, customer.id));

  const linkable = rows.filter((row) => !['otp', 'email.verify'].includes(row.eventKey));
  const withLinks = linkable.filter((row) => notificationHref(row.eventKey, row.payload, 'customer'));
  report.check(
    'a customer notification links somewhere',
    linkable.length === 0 || withLinks.length === linkable.length,
    { linkable: linkable.length, linked: withLinks.length },
  );

  const orderRow = linkable.find((row) => row.eventKey.startsWith('order.'));
  if (orderRow) {
    const href = notificationHref(orderRow.eventKey, orderRow.payload, 'customer');
    report.check(
      'and an order notification links to that order',
      Boolean(href?.startsWith('/account/orders/')),
      href,
    );
    report.check(
      'which resolves',
      (await status(`/fa${href}`, customerCookie)) === 200,
      href,
    );
  }

  // ---------------------------------------------- accepting an order tells
  report.section('Accepting an order produces a linked customer notification');

  const [placed] = await db
    .select({ id: orders.id, reference: orders.reference, userId: orders.userId })
    .from(orders)
    .where(
      raw`orders.status = 'placed' and exists (
        select 1 from order_items oi join shops s on s.id = oi.shop_id
        where oi.order_id = orders.id and s.slug = 'kabul-electronics'
      )`,
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!placed) {
    console.log('  ℹ no placed order at the demo shop — skipping');
  } else {
    const client = await ActionClient.create(['/fa/dashboard/orders'], shopCookie);
    const accepted = await client.call(shopCookie, 'advanceOrderStatus', [
      { orderId: placed.id, to: 'accepted' },
    ]);
    report.check('the shopkeeper accepts it', accepted?.ok === true, accepted);

    const [written] = await db
      .select({
        id: notifications.id,
        eventKey: notifications.eventKey,
        payload: notifications.payload,
        recipientUserId: notifications.recipientUserId,
        read: notifications.read,
      })
      .from(notifications)
      .where(
        raw`notifications.event_key = 'order.accepted'
            and notifications.payload->>'reference' = ${placed.reference}`,
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    report.check('the customer is notified', Boolean(written));
    report.check('and it is addressed to them, not broadcast', written?.recipientUserId === placed.userId);
    report.check('it arrives unread', written?.read === false);
    report.check(
      'and it deep-links to the order',
      notificationHref(written.eventKey, written.payload, 'customer') ===
        `/account/orders/${placed.reference}`,
    );

    // Put the order, the event and the notification back.
    await db.update(orders).set({ status: 'placed' }).where(eq(orders.id, placed.id));
    await db.execute(
      raw`delete from order_events where order_id = ${placed.id} and to_status = 'accepted'`,
    );
    await db.execute(raw`delete from notifications where id = ${written.id}`);
  }

  // ----------------------------------------------------------- read state
  report.section('Unread counts are per person and correct');

  const countFor = async (userId: string) => {
    const [row] = await db.execute<{ n: number }>(raw`
      select count(*)::int as n from notifications
      where recipient_user_id = ${userId} and read = false
        and event_key not in ('otp', 'email.verify')
    `);
    return Number(row.n);
  };

  const [shopkeeper] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, SHOPKEEPER))
    .limit(1);

  const customerBefore = await countFor(customer.id);
  const shopkeeperBefore = await countFor(shopkeeper.id);

  // Snapshot exactly which rows are unread, so read state can be restored.
  const unreadIds = await db.execute<{ id: string }>(raw`
    select id::text from notifications
    where recipient_user_id = ${customer.id} and read = false
  `);

  const client = await ActionClient.create(['/fa/notifications'], customerCookie);
  const readAll = await client.call(customerCookie, 'markAllMineRead', []);
  report.check('the customer can mark everything read', readAll?.ok === true, readAll);

  report.check('their count goes to zero', (await countFor(customer.id)) === 0);
  report.check(
    'and nobody else is touched',
    (await countFor(shopkeeper.id)) === shopkeeperBefore,
    { before: shopkeeperBefore, after: await countFor(shopkeeper.id) },
  );

  // Restore.
  for (const row of unreadIds as unknown as Array<{ id: string }>) {
    await db.execute(raw`update notifications set read = false where id = ${row.id}`);
  }
  report.check('read state is restored', (await countFor(customer.id)) === customerBefore, {
    before: customerBefore,
    after: await countFor(customer.id),
  });

  // ----------------------------------------------------------- categories
  report.section('Categories');

  const keys = await db.execute<{ event_key: string }>(
    raw`select distinct event_key from notifications`,
  );
  const uncategorised = (keys as unknown as Array<{ event_key: string }>).filter(
    (row) => notificationCategory(row.event_key) === 'account' && !row.event_key.startsWith('user.'),
  );
  /*
   * Everything unmapped falls into `account`, which is the safe default and
   * also where an unnoticed new event type would silently pile up. OTP and the
   * email code belong there; anything else means a category is missing.
   */
  const unexpected = uncategorised.filter(
    (row) => !['otp', 'email.verify'].includes(row.event_key),
  );
  report.check('every event type has a category', unexpected.length === 0, {
    unmapped: unexpected.map((row) => row.event_key),
  });

  const failed = report.summary();
  await pg.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await pg.end();
  process.exit(1);
});
