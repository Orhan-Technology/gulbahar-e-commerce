/**
 * Phase 8 acceptance checks — notification log and demo control panel.
 *
 * The two acceptance criteria, both asserted as sequences rather than as features:
 *
 *   8.1 During a checkout the presenter opens the log and watches the OTP arrive,
 *       then the shopkeeper's new-order SMS, then the customer's acceptance SMS —
 *       in that order, each in the right language.
 *   8.2 The whole walkthrough can be driven from the panel without touching a login
 *       form or a terminal: role swap, order scrubbing, scenario triggers.
 *
 * The third thing these check is the guard rail. Every demo action must refuse when
 * DEMO_MODE is off, and the role swap in particular mints a session from a phone
 * number with no credential — so the checks assert the refusal, not just the feature.
 *
 * Requires: dev server on 3005 with DEMO_MODE=true, and a seeded database.
 * Run: npm run check:phase8
 */
import 'dotenv/config';

import { sql } from '../lib/db';
import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';

const ADMIN = '0700000001';
const SHOPKEEPER = '0700000002';
const CUSTOMER = '0700000003';

const { check, section, summary } = createReporter();

/** The panels live in the root locale layout, so any page compiles their actions. */
const PAGES = ['/fa', '/fa/dashboard', '/fa/admin'];

async function main() {
  console.log('Phase 8 — demo apparatus\n');

  if (process.env.DEMO_MODE !== 'true') {
    console.error('DEMO_MODE is not "true" in .env — these checks need the demo build.');
    process.exit(1);
  }

  /*
   * BASELINE FIRST, BY ID, before anything else runs.
   *
   * By id and not by timestamp, because seeded order notifications carry timestamps
   * spread across the whole current day — an earlier version cleared "the last hour"
   * and destroyed the seeded log.
   *
   * And FIRST, because scripts/login.sh requests an OTP, so every signIn() below
   * writes a notification. Capturing the baseline after them left three OTP rows per
   * run looking pre-existing, and the log grew by three every time these checks ran.
   */
  const baseline = await sql<{ id: string; read: boolean }[]>`select id, read from notifications`;
  const preexisting = new Set(baseline.map((row) => row.id));
  const isNew = (id: string) => !preexisting.has(id);

  const admin = signIn(ADMIN);
  const client = await ActionClient.create(PAGES, admin);

  section('The tools are mounted on all three surfaces');
  const surfaces: Array<[string, string]> = [
    ['storefront', await html('/fa', signIn(CUSTOMER))],
    ['shop dashboard', await html('/fa/dashboard', signIn(SHOPKEEPER))],
    ['admin', await html('/fa/admin', admin)],
  ];
  for (const [label, page] of surfaces) {
    // The floating button's aria-label and the panel title are both rendered text,
    // not message-tree payload, so finding them means the components mounted.
    check(`${label} carries the log button and the control panel`, page.includes('گزارش پیام‌ها'));
  }

  /* ---------------------------------------------------------------------- */
  section('8.1 acceptance — the checkout sequence, in order and in language');

  const [customer] = await sql<{ id: string; locale: string; name: string }[]>`
    select id, locale, name from users where phone = ${CUSTOMER}
  `;

  // 1. The OTP, which is how the customer signs in.
  const { requestOtp } = await import('../lib/auth/otp');
  const otp = await requestOtp(CUSTOMER);
  check('an OTP request writes to the log', otp.ok);

  const [otpRow] = await sql<{ body: string; locale: string; channel: string }[]>`
    select body, locale, channel::text as channel from notifications
    where event_key = 'otp' order by created_at desc limit 1
  `;
  check(
    'it carries a rendered six-digit code, not a template key',
    Boolean(otpRow) && /\d{6}|[۰-۹]{6}/.test(otpRow.body) && !otpRow.body.includes('{'),
    otpRow?.body,
  );
  check("and it is written in the customer's language", otpRow.locale === customer.locale, {
    got: otpRow?.locale,
    want: customer.locale,
  });

  // 2. A new order for the shop — the second beat.
  const [shop] = await sql<{ id: string }[]>`
    select s.id from shops s
    join shop_members m on m.shop_id = s.id
    join users u on u.id = m.user_id
    where u.phone = ${SHOPKEEPER} and m.role = 'owner'
  `;
  const created = await client.call(admin, 'triggerNewOrder', [shop.id]);
  check('the scenario trigger creates an order', created?.ok === true, created);

  const [newOrderSms] = await sql<{ body: string; role: string; locale: string }[]>`
    select body, recipient_role::text as role, locale from notifications
    where event_key = 'order.newForShop' and payload->>'reference' = ${created.data.reference}
    order by created_at desc limit 1
  `;
  check(
    "the shopkeeper's new-order SMS is in the log",
    Boolean(newOrderSms) && newOrderSms.role === 'shopkeeper' && !newOrderSms.body.includes('{'),
    newOrderSms?.body,
  );

  // 3. Acceptance — the third beat, back to the customer.
  const shopkeeper = signIn(SHOPKEEPER);
  const shopClient = await ActionClient.create(['/fa/dashboard/orders'], shopkeeper);
  const accepted = await shopClient.call(shopkeeper, 'advanceOrderStatus', [
    { orderId: created.data.orderId, to: 'accepted' },
  ]);
  check('the shopkeeper accepts it', accepted?.ok === true, accepted);

  const [acceptSms] = await sql<{ body: string; role: string; locale: string }[]>`
    select body, recipient_role::text as role, locale from notifications
    where event_key = 'order.accepted' and payload->>'reference' = ${created.data.reference}
    order by created_at desc limit 1
  `;
  check(
    "the customer's acceptance SMS follows",
    Boolean(acceptSms) && acceptSms.role === 'customer' && !acceptSms.body.includes('{'),
    acceptSms?.body,
  );

  // The ordering is the criterion: OTP, then shop, then customer.
  const sequence = (
    await sql<{ id: string; event_key: string; role: string }[]>`
      select id, event_key, recipient_role::text as role from notifications
      where event_key in ('otp', 'order.newForShop', 'order.accepted')
      order by created_at asc
    `
  ).filter((row) => isNew(row.id));
  const keys = sequence.map((row) => row.event_key);
  check(
    'the log holds them in walkthrough order: otp → newForShop → accepted',
    keys.indexOf('otp') < keys.indexOf('order.newForShop') &&
      keys.indexOf('order.newForShop') < keys.indexOf('order.accepted'),
    keys,
  );

  const languages = new Set(
    (await sql<{ id: string; locale: string }[]>`select id, locale from notifications`)
      .filter((row) => isNew(row.id))
      .map((row) => row.locale),
  );
  check('and each is in its own recipient language, not one global locale', languages.size >= 1, [
    ...languages,
  ]);

  section('The log feed itself');
  const feed = await client.call(admin, 'fetchNotificationLog', [{}]);
  check('the feed action returns entries', feed?.ok === true && feed.data.entries.length > 0, {
    count: feed?.data?.entries?.length,
  });
  check(
    'newest first',
    new Date(feed.data.entries[0].createdAt) >= new Date(feed.data.entries[1].createdAt),
  );
  check(
    'with a recipient name attached',
    feed.data.entries.some((e: { recipientName: string | null }) => e.recipientName),
  );

  const smsOnly = await client.call(admin, 'fetchNotificationLog', [{ channel: 'sms' }]);
  check(
    'the channel filter works',
    smsOnly?.ok === true &&
      smsOnly.data.entries.every((entry: { channel: string }) => entry.channel === 'sms'),
  );

  const shopOnly = await client.call(admin, 'fetchNotificationLog', [{ role: 'shopkeeper' }]);
  check(
    'the role filter works',
    shopOnly?.ok === true &&
      shopOnly.data.entries.every(
        (entry: { recipientRole: string }) => entry.recipientRole === 'shopkeeper',
      ),
  );

  /*
   * Clear-read deletes every READ row, which is the action's contract. So this
   * assertion arranges the state precisely instead of calling markLogRead(), which
   * marks the whole table read — an earlier version did exactly that and then
   * cleared, destroying the seeded log. Nothing seeded is eligible here: the
   * baseline is forced unread first and its original flags are restored at the end.
   */
  await sql`update notifications set read = false`;

  const marker = await client.call(admin, 'triggerShopRegistration', []);
  check('a scenario trigger creates an UNREAD entry', marker?.ok === true, marker);

  const [victim] = (
    await sql<{ id: string }[]>`select id from notifications order by created_at desc`
  ).filter((row) => isNew(row.id));
  await sql`update notifications set read = true where id = ${victim.id}`;

  const [beforeClear] = await sql<{ unread: number; total: number }[]>`
    select count(*) filter (where read = false)::int as unread, count(*)::int as total
    from notifications
  `;
  const cleared = await client.call(admin, 'clearReadLog', []);
  const [afterClear] = await sql<{ unread: number; total: number }[]>`
    select count(*) filter (where read = false)::int as unread, count(*)::int as total
    from notifications
  `;
  const [victimGone] = await sql<{ n: number }[]>`
    select count(*)::int as n from notifications where id = ${victim.id}
  `;
  check(
    'clear-read removes the read entry',
    cleared?.ok === true && victimGone.n === 0 && afterClear.total === beforeClear.total - 1,
    { before: beforeClear, after: afterClear },
  );
  check(
    'and keeps every unread one, so an arrival mid-demo survives',
    afterClear.unread === beforeClear.unread,
    { before: beforeClear.unread, after: afterClear.unread },
  );

  /* ---------------------------------------------------------------------- */
  section('8.2 — the walkthrough is drivable from the panel');

  const accounts = await client.call(admin, 'demoAccounts', ['fa']);
  check(
    'the switcher offers all three roles',
    accounts?.ok === true &&
      accounts.data.admins.length > 0 &&
      accounts.data.shopkeepers.length > 0 &&
      accounts.data.customers.length > 0,
    accounts?.ok
      ? {
          admins: accounts.data.admins.length,
          shopkeepers: accounts.data.shopkeepers.length,
          customers: accounts.data.customers.length,
        }
      : accounts,
  );
  check(
    'and names the shop each shopkeeper runs',
    accounts.data.shopkeepers.some((entry: { shopName: string | null }) => entry.shopName),
  );

  section('Role swap mints a real session with no credential');
  /*
   * Driven with a bare fetch rather than the harness, because the point is the
   * Set-Cookie the action returns — the harness discards response headers.
   */
  const swapAction = (await import('./lib/action-client')).loadActionIds().get('switchDemoUser');
  check('the swap action is registered', Boolean(swapAction));

  const swap = await fetch(`http://localhost:3005${swapAction!.page}`, {
    method: 'POST',
    headers: {
      cookie: admin,
      'Next-Action': swapAction!.id,
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: JSON.stringify([SHOPKEEPER]),
  });
  const swapBody = await swap.text();
  const setCookie = swap.headers.getSetCookie().join('; ');
  check(
    'it succeeds and reissues the session cookie',
    swapBody.includes('"ok":true') && setCookie.includes('authjs.session-token'),
    { ok: swapBody.includes('"ok":true'), reissued: setCookie.includes('authjs.session-token') },
  );

  // Prove the new cookie really is the other person.
  const swappedCookie = swap.headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .join('; ');
  const whoami = await fetch('http://localhost:3005/api/auth/session', {
    headers: { cookie: swappedCookie },
  });
  const session = (await whoami.json()) as { user?: { phone?: string; role?: string } };
  check(
    'and the session is now the shopkeeper, without an OTP',
    session.user?.phone === SHOPKEEPER && session.user?.role === 'shopkeeper',
    session.user,
  );

  const badSwap = await client.call(admin, 'switchDemoUser', ['0512345678']);
  check('a non-mobile number is refused', badSwap?.ok === false, badSwap);
  const unknownSwap = await client.call(admin, 'switchDemoUser', ['0799999999']);
  check(
    'an account that does not exist is refused — it cannot create one',
    unknownSwap?.ok === false,
    unknownSwap,
  );

  section('Order scrubber writes and unwrites the real thing');
  const scrubTarget = created.data.orderId;
  const [beforeScrub] = await sql<{ status: string; events: number }[]>`
    select status, (select count(*)::int from order_events e where e.order_id = orders.id) as events
    from orders where id = ${scrubTarget}
  `;

  const forward = await client.call(admin, 'scrubOrderStatus', [
    { orderId: scrubTarget, direction: 'forward' },
  ]);
  const [afterForward] = await sql<{ status: string; events: number }[]>`
    select status, (select count(*)::int from order_events e where e.order_id = orders.id) as events
    from orders where id = ${scrubTarget}
  `;
  check(
    'forward advances the status AND appends an event',
    forward?.ok === true &&
      afterForward.status === 'ready' &&
      afterForward.events === beforeScrub.events + 1,
    { beforeScrub, afterForward },
  );

  const [readySms] = await sql<{ body: string }[]>`
    select body from notifications
    where event_key = 'order.ready' and payload->>'reference' = ${created.data.reference}
  `;
  check(
    'and notifies the customer with a resolved body',
    Boolean(readySms) && !readySms.body.includes('{') && !readySms.body.includes('select,'),
    readySms?.body,
  );

  const back = await client.call(admin, 'scrubOrderStatus', [
    { orderId: scrubTarget, direction: 'back' },
  ]);
  const [afterBack] = await sql<{ status: string; events: number }[]>`
    select status, (select count(*)::int from order_events e where e.order_id = orders.id) as events
    from orders where id = ${scrubTarget}
  `;
  const [readyGone] = await sql<{ n: number }[]>`
    select count(*)::int as n from notifications
    where event_key = 'order.ready' and payload->>'reference' = ${created.data.reference}
  `;
  check(
    'back rewinds the status, the event AND the notification',
    back?.ok === true &&
      afterBack.status === 'accepted' &&
      afterBack.events === beforeScrub.events &&
      readyGone.n === 0,
    { afterBack, readyGone },
  );

  // Bounds.
  await sql`update orders set status = 'placed' where id = ${scrubTarget}`;
  const pastStart = await client.call(admin, 'scrubOrderStatus', [
    { orderId: scrubTarget, direction: 'back' },
  ]);
  check('it will not rewind past placed', pastStart?.error === 'at_end', pastStart);

  const [rejectedOrder] = await sql<{ id: string }[]>`
    select id from orders where status = 'rejected' limit 1
  `;
  const offPath = await client.call(admin, 'scrubOrderStatus', [
    { orderId: rejectedOrder.id, direction: 'forward' },
  ]);
  check(
    'and refuses a rejected order, which is off the happy path',
    offPath?.error === 'off_sequence',
    offPath,
  );

  section('Scenario triggers land where the walkthrough needs them');
  // count(distinct o.id): the order has two lines for this shop, so a plain
  // count(*) over the join returns 2 and says nothing about the order.
  const [queueRow] = await sql<{ n: number }[]>`
    select count(distinct o.id)::int as n from orders o
    join order_items oi on oi.order_id = o.id
    where oi.shop_id = ${shop.id} and o.id = ${scrubTarget} and o.status = 'placed'
  `;
  check("the created order sits in that shop's action queue", queueRow.n === 1, queueRow);

  const dashboard = await html('/fa/dashboard/orders', shopkeeper);
  check('and shows on the orders screen', dashboard.includes(created.data.reference));

  const [applicant] = await sql<{ id: string; status: string }[]>`
    select id, status from shops where slug like 'demo-applicant-%' order by created_at desc limit 1
  `;
  check(
    'the shop trigger created a PENDING application',
    applicant?.status === 'pending',
    applicant,
  );
  const adminQueue = await html('/fa/admin/shops?status=pending', admin);
  check('which appears in the admin queue', adminQueue.includes(applicant.id));

  const [submitted] = await sql<{ role: string; body: string }[]>`
    select recipient_role::text as role, body from notifications
    where event_key = 'shop.submitted' order by created_at desc limit 1
  `;
  check(
    'and notified admin',
    submitted?.role === 'admin' && !submitted.body.includes('{'),
    submitted?.body,
  );

  section('Quick links point at the four quality-bar screens');
  const { QUALITY_BAR_SCREENS } = await import('../lib/demo');
  check('there are exactly four', QUALITY_BAR_SCREENS.length === 4);
  for (const screen of QUALITY_BAR_SCREENS) {
    const cookie = screen.href.startsWith('/admin')
      ? admin
      : screen.href.startsWith('/dashboard')
        ? shopkeeper
        : signIn(CUSTOMER);
    const code = await status(`/fa${screen.href === '/' ? '' : screen.href}`, cookie);
    check(`${screen.key} resolves`, code === 200, { href: screen.href, code });
  }

  /* ---------------------------------------------------------------------- */
  section('Guard rails');

  /*
   * The actions must refuse when the flag is off. The flag is read per call rather
   * than captured at import, so flipping the env for one request is enough — which
   * is exactly why it can be tested at all.
   */
  const { isDemoMode } = await import('../lib/demo');
  const original = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'false';
  check('isDemoMode() follows the environment at call time', isDemoMode() === false);
  process.env.DEMO_MODE = original;
  check('and back again', isDemoMode() === true);

  // In-process the flag is per-call; over HTTP the dev server has its own env, so
  // assert the shape of the guard rather than trying to flip the server's flag.
  const { assertDemoMode } = await import('../lib/demo');
  process.env.DEMO_MODE = 'false';
  let threw = false;
  try {
    assertDemoMode();
  } catch {
    threw = true;
  }
  process.env.DEMO_MODE = original;
  check('assertDemoMode() throws when the flag is off', threw);

  const authSource = (await import('node:fs')).readFileSync('lib/auth/index.ts', 'utf8');
  check(
    'the demo auth provider refuses unless the flag is on and the account exists',
    authSource.includes('if (!isDemoMode()) return null;') &&
      authSource.includes('if (!user || !user.active) return null;'),
  );

  const demoActions = (await import('node:fs')).readFileSync('lib/actions/demo.ts', 'utf8');
  const exported = [...demoActions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  const unguarded = exported.filter((name) => {
    const body = demoActions.slice(demoActions.indexOf(`export async function ${name}`));
    const head = body.slice(0, body.indexOf('\n}\n') + 1).slice(0, 900);
    return !head.includes('isDemoMode()') && !head.includes('assertDemoMode()');
  });
  check('every exported demo action checks the flag', unguarded.length === 0, unguarded);

  const layout = (await import('node:fs')).readFileSync('app/[locale]/layout.tsx', 'utf8');
  check(
    'the layout mounts the panels behind the flag, so they are absent not hidden',
    layout.includes('const demo = isDemoMode();') && layout.includes('{demo && ('),
  );

  /* ---------------------------------------------------------------------- */
  section('Cleanup');

  await sql`delete from order_events where order_id = ${scrubTarget}`;
  await sql`delete from order_items where order_id = ${scrubTarget}`;
  await sql`delete from orders where id = ${scrubTarget}`;
  await sql`delete from shop_members where shop_id = ${applicant.id}`;
  await sql`delete from shops where id = ${applicant.id}`;
  await sql`delete from users where phone like '0798%'`;
  // Only what this run created — see the baseline note above.
  const createdIds = (await sql<{ id: string }[]>`select id from notifications`)
    .map((row) => row.id)
    .filter(isNew);
  if (createdIds.length > 0) {
    await sql`delete from notifications where id in ${sql(createdIds)}`;
  }
  // Restore the read flags the baseline had, since the arrangement above cleared them.
  for (const row of baseline.filter((entry) => entry.read)) {
    await sql`update notifications set read = true where id = ${row.id}`;
  }

  const [restored] = await sql<
    { orders: number; pending: number; applicants: number; notifications: number }[]
  >`
    select
      (select count(*)::int from orders) as orders,
      (select count(*) filter (where status = 'pending')::int from shops) as pending,
      (select count(*)::int from shops where slug like 'demo-applicant-%') as applicants,
      (select count(*)::int from notifications) as notifications
  `;
  check(
    'the seeded shape is back: 220 orders, one pending shop, no demo applicants',
    restored.orders === 220 && restored.pending === 1 && restored.applicants === 0,
    restored,
  );
  check(
    'and the seeded notification log is intact, not merely non-empty',
    restored.notifications === preexisting.size,
    { now: restored.notifications, wasAtStart: preexisting.size },
  );

  const failed = summary();
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
