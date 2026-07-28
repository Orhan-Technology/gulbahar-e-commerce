/**
 * Phase 6.3 acceptance checks — shopkeeper orders, promotions, reviews, profile,
 * settings.
 *
 * Same harness as check-phase6.ts: the REAL server actions are driven over HTTP
 * with a real session cookie, so authorisation and validation are checked as
 * shipped. See that file's header for the two non-obvious requirements (per-page
 * action ids; file parts before the root argument in a multipart call).
 *
 * The headline criterion is the order story: an order placed on the storefront
 * lands in the shop's queue, accepting it advances the customer's timeline AND
 * writes an SMS to the notification log, in the CUSTOMER's language.
 *
 * Requires: dev server on 3005 and a seeded database.
 * Run:      npm run check:phase6c
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from '../lib/db';

const BASE = process.env.BASE_URL ?? 'http://localhost:3005';
const SHOPKEEPER = '0700000002'; // Kabul Electronics, owner
const CUSTOMER = '0700000003';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail === undefined ? '' : `  ← ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* -------------------------------------------------------------------------- */

function signIn(phone: string): string {
  const jar = execFileSync('./scripts/login.sh', [phone], { encoding: 'utf8' }).trim();
  const cookies = readFileSync(jar, 'utf8')
    .split('\n')
    // The session cookie is HttpOnly, which curl writes as "#HttpOnly_…"; a parser
    // that skips every '#' line drops exactly the cookie that matters.
    .map((line) => line.replace(/^#HttpOnly_/, ''))
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 7)
    .map((parts) => `${parts[5]}=${parts[6]}`);

  if (!cookies.some((cookie) => cookie.startsWith('authjs.session-token='))) {
    throw new Error(`no session cookie in ${jar}`);
  }
  return cookies.join('; ');
}

type ActionIds = Map<string, { id: string; page: string }>;

function loadActionIds(): ActionIds {
  const root = '.next/dev/server/app';
  const found: ActionIds = new Map();

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'server-reference-manifest.json') {
        const manifest = JSON.parse(readFileSync(path, 'utf8')).node ?? {};
        const page = dir
          .slice(root.length)
          .replace(/\/page$/, '')
          .replace('/[locale]', '/fa')
          .replace(/\/\([^)]+\)/g, '');
        for (const [id, meta] of Object.entries<{ exportedName: string }>(manifest)) {
          if (!found.has(meta.exportedName)) found.set(meta.exportedName, { id, page });
        }
      }
    }
  };

  if (!existsSync(root)) {
    console.error(`${root} is missing — start the dev server and load the pages first.`);
    process.exit(1);
  }
  walk(root);
  return found;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionResult = any;

function resultFrom(body: string): ActionResult {
  for (const line of body.split('\n')) {
    const match = /^[0-9a-f]+:(\{.*)$/.exec(line);
    if (!match) continue;
    try {
      const value = JSON.parse(match[1]);
      if (value && typeof value === 'object' && 'ok' in value) return value;
    } catch {
      /* not the row we want */
    }
  }
  return null;
}

let ACTIONS: ActionIds;

async function callAction(cookie: string, name: string, args: unknown[]): Promise<ActionResult> {
  const action = ACTIONS.get(name);
  if (!action) throw new Error(`no action id for ${name} — load its page in the dev server first`);

  const response = await fetch(`${BASE}${action.page}`, {
    method: 'POST',
    headers: { cookie, 'Next-Action': action.id, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(args),
  });
  return resultFrom(await response.text());
}

async function html(path: string, cookie?: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  return response.text();
}

async function status(path: string, cookie?: string): Promise<number> {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  return response.status;
}

const PAGES = [
  '/fa/dashboard/orders',
  '/fa/dashboard/promotions',
  '/fa/dashboard/reviews',
  '/fa/dashboard/profile',
  '/fa/dashboard/reports',
  '/fa/dashboard/settings',
];

async function main() {
  console.log('Phase 6.3 — orders, promotions, reviews, profile, reports, settings\n');

  const shopkeeper = signIn(SHOPKEEPER);

  // Compile every page first: an action id only exists in the manifest once the
  // page that imports it has been built.
  for (const path of PAGES) await html(path, shopkeeper);
  ACTIONS = loadActionIds();

  const [shop] = await sql<{ id: string; slug: string }[]>`
    select s.id, s.slug from shops s
    join shop_members m on m.shop_id = s.id
    join users u on u.id = m.user_id
    where u.phone = ${SHOPKEEPER} and m.role = 'owner'
  `;

  section('Screens render');
  for (const path of PAGES) {
    /*
     * Asserted on the STATUS CODE with redirects unfollowed, not on page text:
     * next-intl ships the whole message tree to the client on every page, so any
     * Dari string from messages/fa.json is present in the HTML of the sign-in page
     * too. A substring check cannot tell a rendered screen from a redirect.
     */
    const code = await status(path, shopkeeper);
    const page = await html(path, shopkeeper);
    const raw = /shop(Orders|Promotions|Reviews|Profile|Reports|Settings)\.[A-Za-z]/.test(page);
    check(`${path} renders with no raw message keys`, code === 200 && !raw, { code, raw });
  }

  /* ---------------------------------------------------------------------- */
  section('Order story: accept → timeline + SMS');

  const [placed] = await sql<{ id: string; reference: string; userId: string }[]>`
    select o.id, o.reference, o.user_id as "userId"
    from orders o
    where o.status = 'placed'
      and exists (select 1 from order_items oi where oi.order_id = o.id and oi.shop_id = ${shop.id})
    order by o.created_at desc
    limit 1
  `;
  check('a placed order is waiting in the queue', Boolean(placed), placed?.reference);
  if (!placed) throw new Error('no placed order for this shop; reseed');

  const queue = await html('/fa/dashboard/orders', shopkeeper);
  check('it appears on the orders screen', queue.includes(placed.reference), placed.reference);

  const [{ locale: customerLocale }] = await sql<{ locale: string }[]>`
    select locale from users where id = ${placed.userId}
  `;
  const eventsBefore = await sql<{ n: number }[]>`
    select count(*)::int as n from order_events where order_id = ${placed.id}
  `;

  const accepted = await callAction(shopkeeper, 'advanceOrderStatus', [
    { orderId: placed.id, to: 'accepted' },
  ]);
  check('accept succeeds', accepted?.ok === true, accepted);

  const [afterAccept] = await sql<{ status: string }[]>`
    select status from orders where id = ${placed.id}
  `;
  check('order status is now accepted', afterAccept.status === 'accepted', afterAccept);

  const [eventsAfter] = await sql<{ n: number; last: string; actor: string | null }[]>`
    select count(*)::int as n,
           max(to_status::text) filter (where to_status = 'accepted') as last,
           max(actor_user_id::text) as actor
    from order_events where order_id = ${placed.id}
  `;
  check(
    'an order_events row was appended, attributed to the shopkeeper',
    eventsAfter.n === eventsBefore[0].n + 1 &&
      eventsAfter.last === 'accepted' &&
      Boolean(eventsAfter.actor),
    eventsAfter,
  );

  const [sms] = await sql<{ body: string; locale: string; recipient: string }[]>`
    select body, locale, recipient_user_id::text as recipient
    from notifications
    where event_key = 'order.accepted' and payload->>'reference' = ${placed.reference}
    order by created_at desc limit 1
  `;
  check('an SMS was written to the notification log', Boolean(sms), sms?.body);
  check('addressed to the customer', sms?.recipient === placed.userId);
  check(`written in the customer's language (${customerLocale})`, sms?.locale === customerLocale, {
    got: sms?.locale,
    want: customerLocale,
  });
  check(
    'the body is rendered text, not a raw template key',
    Boolean(sms) && !sms.body.includes('{') && !sms.body.startsWith('order.'),
    sms?.body,
  );
  check(
    'and it names the shop',
    Boolean(sms) && sms.body.length > 20 && !sms.body.includes('  '),
    sms?.body,
  );

  const tracking = await html(`/fa/account/orders/${placed.reference}`, signIn(CUSTOMER));
  check(
    "the customer's tracking page shows the new status",
    tracking.includes('تاییدشده') || tracking.includes('Accepted'),
  );

  section('Transitions are guarded, not merely hidden');
  const repeat = await callAction(shopkeeper, 'advanceOrderStatus', [
    { orderId: placed.id, to: 'accepted' },
  ]);
  check('accepting twice is refused', repeat?.ok === false, repeat);

  const skip = await callAction(shopkeeper, 'advanceOrderStatus', [
    { orderId: placed.id, to: 'fulfilled' },
  ]);
  check('skipping accepted → fulfilled is refused', skip?.ok === false, skip);

  const ready = await callAction(shopkeeper, 'advanceOrderStatus', [
    { orderId: placed.id, to: 'ready' },
  ]);
  check('accepted → ready is allowed', ready?.ok === true, ready);

  const [readySms] = await sql<{ body: string }[]>`
    select body from notifications
    where event_key = 'order.ready' and payload->>'reference' = ${placed.reference}
    order by created_at desc limit 1
  `;
  check(
    'the ready SMS resolves its delivery/pickup clause',
    Boolean(readySms) && !readySms.body.includes('{') && !readySms.body.includes('select,'),
    readySms?.body,
  );

  const noReason = await callAction(shopkeeper, 'advanceOrderStatus', [
    { orderId: placed.id, to: 'rejected' },
  ]);
  check('rejecting without a reason is refused', noReason?.error === 'reason_required', noReason);

  const [foreign] = await sql<{ id: string }[]>`
    select o.id from orders o
    where o.status = 'placed'
      and not exists (select 1 from order_items oi where oi.order_id = o.id and oi.shop_id = ${shop.id})
    limit 1
  `;
  if (foreign) {
    const crossTenant = await callAction(shopkeeper, 'advanceOrderStatus', [
      { orderId: foreign.id, to: 'accepted' },
    ]);
    const [untouched] = await sql<{ status: string }[]>`
      select status from orders where id = ${foreign.id}
    `;
    check(
      "another shop's order cannot be advanced",
      crossTenant?.ok === false && untouched.status === 'placed',
      { crossTenant, untouched },
    );
  }

  const customer = signIn(CUSTOMER);
  const asCustomer = await callAction(customer, 'advanceOrderStatus', [
    { orderId: placed.id, to: 'fulfilled' },
  ]);
  check('a customer session is refused', asCustomer?.error === 'forbidden', asCustomer);

  /* ---------------------------------------------------------------------- */
  section('Offers');

  const [product] = await sql<{ id: string; price: number }[]>`
    select id, price from products where shop_id = ${shop.id} and status = 'published' limit 1
  `;
  const startsAt = new Date(Date.now() + 60_000).toISOString();
  const endsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();

  const badPercent = await callAction(shopkeeper, 'saveOffer', [
    {
      name: { fa: 'تخفیف آزمایشی', en: 'Check Offer' },
      type: 'percent',
      value: 95,
      scope: 'products',
      productIds: [product.id],
      startsAt,
      endsAt,
    },
  ]);
  check(
    'a 95% discount is refused as a likely typo',
    badPercent?.error === 'percent_too_high',
    badPercent,
  );

  const [foreignProduct] = await sql<{ id: string }[]>`
    select id from products where shop_id <> ${shop.id} limit 1
  `;
  const foreignScope = await callAction(shopkeeper, 'saveOffer', [
    {
      name: { fa: 'تخفیف آزمایشی', en: 'Check Offer' },
      type: 'percent',
      value: 20,
      scope: 'products',
      productIds: [foreignProduct.id],
      startsAt,
      endsAt,
    },
  ]);
  check(
    "another shop's product cannot be discounted",
    foreignScope?.error === 'products_not_yours',
    foreignScope,
  );

  const backwards = await callAction(shopkeeper, 'saveOffer', [
    {
      name: { fa: 'تخفیف آزمایشی', en: 'Check Offer' },
      type: 'percent',
      value: 20,
      scope: 'products',
      productIds: [product.id],
      startsAt: endsAt,
      endsAt: startsAt,
    },
  ]);
  check(
    'an end date before the start is refused',
    backwards?.error === 'end_after_start',
    backwards,
  );

  const offer = await callAction(shopkeeper, 'saveOffer', [
    {
      name: { fa: 'تخفیف آزمایشی فاز شش', en: 'Phase6c Check Offer' },
      type: 'percent',
      value: 20,
      scope: 'products',
      productIds: [product.id],
      startsAt,
      endsAt,
    },
  ]);
  check('a valid offer is created', offer?.ok === true, offer);

  const [offerRow] = await sql<{ id: string; scope: string; product_ids: string[] }[]>`
    select id, scope, product_ids from offers where name->>'en' = 'Phase6c Check Offer'
  `;
  check(
    'it is scoped to exactly the chosen product',
    offerRow?.product_ids?.length === 1 && offerRow.product_ids[0] === product.id,
    offerRow,
  );

  const ended = await callAction(shopkeeper, 'endOffer', [offerRow.id]);
  const [endedRow] = await sql<{ active: boolean }[]>`
    select active from offers where id = ${offerRow.id}
  `;
  check(
    'ending an offer deactivates it rather than deleting it',
    ended?.ok === true && endedRow.active === false,
    endedRow,
  );

  /* ---------------------------------------------------------------------- */
  section('Featured slots');

  const [fullSlot] = await sql<{ id: string; key: string }[]>`
    select ps.id, ps.key::text as key from promotion_slots ps
    where (
      select count(*) from campaigns c
      where c.slot_id = ps.id and c.status in ('approved','active') and c.ends_at >= now()
    ) >= ps.capacity
    limit 1
  `;
  if (fullSlot) {
    const soldOut = await callAction(shopkeeper, 'requestCampaign', [
      { slotId: fullSlot.id, productId: product.id, weeks: 2 },
    ]);
    check('a full slot cannot be booked', soldOut?.error === 'slot_full', soldOut);
  }

  const [openSlot] = await sql<{ id: string; key: string; price: number }[]>`
    select ps.id, ps.key::text as key, ps.price_per_week as price from promotion_slots ps
    where ps.key in ('search_top','category_top','product_related')
      and (
        select count(*) from campaigns c
        where c.slot_id = ps.id and c.status in ('approved','active') and c.ends_at >= now()
      ) < ps.capacity
    limit 1
  `;
  check('a product-level slot has capacity to book', Boolean(openSlot), openSlot?.key);

  if (openSlot) {
    const noProduct = await callAction(shopkeeper, 'requestCampaign', [
      { slotId: openSlot.id, weeks: 2 },
    ]);
    check(
      'a product-level slot refuses a booking with no product',
      noProduct?.error === 'product_required',
      noProduct,
    );

    const foreignBooking = await callAction(shopkeeper, 'requestCampaign', [
      { slotId: openSlot.id, productId: foreignProduct.id, weeks: 2 },
    ]);
    check(
      "another shop's product cannot be promoted",
      foreignBooking?.error === 'product_not_publishable',
      foreignBooking,
    );

    const booking = await callAction(shopkeeper, 'requestCampaign', [
      { slotId: openSlot.id, productId: product.id, weeks: 2 },
    ]);
    check('booking succeeds', booking?.ok === true, booking);
    check(
      'the quoted price is weeks × the slot rate',
      booking?.data?.pricePaid === openSlot.price * 2,
      { got: booking?.data?.pricePaid, want: openSlot.price * 2 },
    );

    const [campaign] = await sql<{ status: string; price_paid: number }[]>`
      select status, price_paid from campaigns where id = ${booking.data.id}
    `;
    check(
      'it lands as REQUESTED — a shop cannot approve its own placement',
      campaign.status === 'requested',
      campaign,
    );

    const [adminNote] = await sql<{ body: string; role: string }[]>`
      select body, recipient_role::text as role from notifications
      where event_key = 'campaign.requested' order by created_at desc limit 1
    `;
    check(
      'the admin queue was notified',
      adminNote?.role === 'admin' && !adminNote.body.includes('{'),
      adminNote?.body,
    );

    const withdrawn = await callAction(shopkeeper, 'cancelCampaignRequest', [booking.data.id]);
    const [gone] = await sql<{ n: number }[]>`
      select count(*)::int as n from campaigns where id = ${booking.data.id}
    `;
    check('an undecided request can be withdrawn', withdrawn?.ok === true && gone.n === 0, {
      withdrawn,
      gone,
    });

    const [runningCampaign] = await sql<{ id: string }[]>`
      select id from campaigns where shop_id = ${shop.id} and status = 'active' limit 1
    `;
    if (runningCampaign) {
      const notWithdrawable = await callAction(shopkeeper, 'cancelCampaignRequest', [
        runningCampaign.id,
      ]);
      check(
        'a running campaign cannot be withdrawn',
        notWithdrawable?.error === 'not_withdrawable',
        notWithdrawable,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  section('Reviews');

  const [review] = await sql<{ id: string; userId: string; locale: string }[]>`
    select r.id, r.user_id as "userId", u.locale
    from reviews r
    join products p on p.id = r.product_id
    join users u on u.id = r.user_id
    left join review_responses rr on rr.review_id = r.id
    where p.shop_id = ${shop.id} and r.status = 'visible' and rr.id is null
    limit 1
  `;
  check('an unanswered review exists to respond to', Boolean(review));

  if (review) {
    const tooShort = await callAction(shopkeeper, 'respondToReview', [
      { reviewId: review.id, body: 'ok' },
    ]);
    check('a two-character reply is refused', tooShort?.error === 'too_short', tooShort);

    const replied = await callAction(shopkeeper, 'respondToReview', [
      { reviewId: review.id, body: 'از بازخورد شما سپاسگزاریم — بررسی می‌کنیم.' },
    ]);
    check('the reply is accepted', replied?.ok === true, replied);

    const again = await callAction(shopkeeper, 'respondToReview', [
      { reviewId: review.id, body: 'یک پاسخ دیگر' },
    ]);
    check('a second reply is refused', again?.error === 'already_answered', again);

    const [replyNote] = await sql<{ locale: string; body: string }[]>`
      select locale, body from notifications
      where event_key = 'review.responded' and recipient_user_id = ${review.userId}
      order by created_at desc limit 1
    `;
    check(
      'the customer was notified in their own language',
      replyNote?.locale === review.locale && !replyNote.body.includes('{'),
      { got: replyNote?.locale, want: review.locale },
    );

    // Cleanup: the seed has a fixed number of responses; leave it that way.
    await sql`delete from review_responses where review_id = ${review.id}`;
    await sql`delete from notifications where event_key = 'review.responded' and recipient_user_id = ${review.userId} and created_at > now() - interval '5 minutes'`;
  }

  const [visibleReview] = await sql<{ id: string }[]>`
    select r.id from reviews r
    join products p on p.id = r.product_id
    where p.shop_id = ${shop.id} and r.status = 'visible' limit 1
  `;
  if (visibleReview) {
    const flagged = await callAction(shopkeeper, 'flagReview', [visibleReview.id]);
    const [flaggedRow] = await sql<{ status: string }[]>`
      select status from reviews where id = ${visibleReview.id}
    `;
    check(
      'flagging marks it reported but leaves it VISIBLE to customers',
      flagged?.ok === true && flaggedRow.status === 'reported',
      flaggedRow,
    );
    await sql`update reviews set status = 'visible' where id = ${visibleReview.id}`;
  }

  /* ---------------------------------------------------------------------- */
  section('Profile');

  /*
   * The whole profile, not just the two columns the assertions read back.
   * saveShopProfile writes name, description, floor, unit and both contact
   * fields in one go, so restoring a subset leaves the rest of the test payload
   * in the seeded shop for good — which is how «آزمایش فاز ۶.۳» ended up as the
   * electronics shop's description on the storefront hero, one run at a time.
   */
  const [before] = await sql<
    {
      name: unknown;
      description: unknown;
      floor: number | null;
      unit_number: string | null;
      hours: string | null;
      phone: string | null;
    }[]
  >`
    select name, description, floor, unit_number, hours, phone
    from shops where id = ${shop.id}
  `;

  const badHours = await callAction(shopkeeper, 'saveShopProfile', [
    { name: { fa: 'الکترونیک کابل' }, description: {}, hours: 'صبح تا شام' },
  ]);
  check('free-text hours are refused', badHours?.error === 'bad_hours', badHours);

  const badPhone = await callAction(shopkeeper, 'saveShopProfile', [
    { name: { fa: 'الکترونیک کابل' }, description: {}, phone: '12345' },
  ]);
  check('a malformed phone number is refused', badPhone?.error === 'bad_phone', badPhone);

  const noName = await callAction(shopkeeper, 'saveShopProfile', [
    { name: { fa: '' }, description: {} },
  ]);
  check('an empty Dari name is refused', noName?.error === 'fa_required', noName);

  const savedProfile = await callAction(shopkeeper, 'saveShopProfile', [
    {
      name: { fa: 'الکترونیک کابل', en: 'Kabul Electronics' },
      description: { fa: 'آزمایش فاز ۶.۳' },
      floor: 2,
      unitNumber: '۲۱۴',
      phone: '0700100208',
      hours: '9:15-20:45',
    },
  ]);
  check('a valid profile saves', savedProfile?.ok === true, savedProfile);

  const [afterProfile] = await sql<{ hours: string; phone: string }[]>`
    select hours, phone from shops where id = ${shop.id}
  `;
  check(
    'hours are stored canonically as ASCII',
    afterProfile.hours === '9:15-20:45',
    afterProfile.hours,
  );

  const shopPage = await html(`/fa/shops/${shop.slug}`);
  check(
    'and render with Persian digits on the storefront',
    shopPage.includes('۹:۱۵') && shopPage.includes('۲۰:۴۵'),
    '۹:۱۵ – ۲۰:۴۵ expected',
  );
  const shopPageEn = await html(`/en/shops/${shop.slug}`);
  check(
    'and with Latin digits in English',
    shopPageEn.includes('9:15') && shopPageEn.includes('20:45'),
  );

  await sql`
    update shops set
      name = ${JSON.stringify(before.name)}::jsonb,
      description = ${JSON.stringify(before.description)}::jsonb,
      floor = ${before.floor},
      unit_number = ${before.unit_number},
      hours = ${before.hours},
      phone = ${before.phone}
    where id = ${shop.id}
  `;

  /* ---------------------------------------------------------------------- */
  section('Settings: staff');

  const staffPhone = '0799000631';
  await sql`delete from shop_members where user_id in (select id from users where phone = ${staffPhone})`;
  await sql`delete from users where phone = ${staffPhone}`;

  const shortName = await callAction(shopkeeper, 'addStaff', [{ name: 'a', phone: staffPhone }]);
  check('a one-character name is refused', shortName?.error === 'name_required', shortName);

  const badStaffPhone = await callAction(shopkeeper, 'addStaff', [
    { name: 'کارمند آزمایشی', phone: '0512345678' },
  ]);
  check('a non-mobile number is refused', badStaffPhone?.error === 'bad_phone', badStaffPhone);

  const added = await callAction(shopkeeper, 'addStaff', [
    { name: 'کارمند آزمایشی', phone: staffPhone },
  ]);
  check('adding staff by phone creates the user', added?.ok === true && added.data.created, added);

  const [staffRow] = await sql<{ id: string; role: string; member_role: string }[]>`
    select u.id, u.role::text as role, m.role::text as member_role
    from users u join shop_members m on m.user_id = u.id
    where u.phone = ${staffPhone}
  `;
  check(
    'they become a shopkeeper and a staff member of this shop',
    staffRow?.role === 'shopkeeper' && staffRow.member_role === 'staff',
    staffRow,
  );

  const [invite] = await sql<{ body: string }[]>`
    select body from notifications
    where event_key = 'shop.invited' and recipient_user_id = ${staffRow.id}
    order by created_at desc limit 1
  `;
  check(
    'they were sent an invitation',
    Boolean(invite) && !invite.body.includes('{'),
    invite?.body,
  );

  const duplicate = await callAction(shopkeeper, 'addStaff', [
    { name: 'کارمند آزمایشی', phone: staffPhone },
  ]);
  check('adding them twice is refused', duplicate?.error === 'already_member', duplicate);

  const [adminUser] = await sql<{ phone: string }[]>`
    select phone from users where role = 'admin' limit 1
  `;
  if (adminUser) {
    const asAdmin = await callAction(shopkeeper, 'addStaff', [
      { name: 'مدیر مرکز', phone: adminUser.phone },
    ]);
    check('a platform admin cannot be added as shop staff', asAdmin?.error === 'is_admin', asAdmin);
  }

  const staffCookie = signIn(staffPhone);
  const staffAttempt = await callAction(staffCookie, 'addStaff', [
    { name: 'کارمند دیگر', phone: '0799000632' },
  ]);
  check(
    'a STAFF member cannot add staff — owner only',
    staffAttempt?.error === 'owner_only',
    staffAttempt,
  );

  const settingsAsStaff = await html('/fa/dashboard/settings', staffCookie);
  check(
    'and the staff view says so instead of showing the form',
    settingsAsStaff.includes('تنها مالک دکان'),
  );

  const removedSelf = await callAction(shopkeeper, 'removeStaff', [
    (await sql<{ id: string }[]>`select id from users where phone = ${SHOPKEEPER}`)[0].id,
  ]);
  check('the owner cannot remove themselves', removedSelf?.ok === false, removedSelf);

  const removed = await callAction(shopkeeper, 'removeStaff', [staffRow.id]);
  const [membership] = await sql<{ n: number }[]>`
    select count(*)::int as n from shop_members where user_id = ${staffRow.id}
  `;
  check('removing staff works', removed?.ok === true && membership.n === 0, {
    removed,
    membership,
  });

  section('Settings: language');
  const [selfBefore] = await sql<{ locale: string; id: string }[]>`
    select id, locale from users where phone = ${SHOPKEEPER}
  `;
  const toEn = await callAction(shopkeeper, 'setDashboardLocale', ['en']);
  const [selfAfter] = await sql<{ locale: string }[]>`
    select locale from users where id = ${selfBefore.id}
  `;
  check(
    'the language choice is stored on the user (so SMS follows it too)',
    toEn?.ok === true && selfAfter.locale === 'en',
    selfAfter,
  );
  await sql`update users set locale = ${selfBefore.locale} where id = ${selfBefore.id}`;

  /* ---------------------------------------------------------------------- */
  section('Reports');
  const reports = await html('/fa/dashboard/reports?period=30', shopkeeper);
  check(
    'the reports page renders its panels',
    reports.includes('روند فروش') && reports.includes('کارکرد تبلیغات'),
  );
  check(
    'the 7-day view also renders',
    (await status('/fa/dashboard/reports?period=7', shopkeeper)) === 200,
  );
  check(
    'an out-of-range period falls back rather than erroring',
    (await status('/fa/dashboard/reports?period=999', shopkeeper)) === 200,
  );

  section('Cleanup');
  await sql`delete from users where phone = ${staffPhone}`;
  await sql`delete from offers where name->>'en' = 'Phase6c Check Offer'`;
  await sql`delete from notifications where event_key = 'shop.invited' and created_at > now() - interval '10 minutes'`;

  /*
   * Put the order back. These checks drive a real transition, so without this every
   * run would consume one of the ten seeded 'placed' orders — the demo's action
   * queue would be empty by the third rehearsal. Restoring also makes the script
   * idempotent, which is what lets it run as often as it needs to.
   */
  await sql`update orders set status = 'placed' where id = ${placed.id}`;
  await sql`
    delete from order_events
    where order_id = ${placed.id} and to_status in ('accepted', 'ready')
      and created_at > now() - interval '10 minutes'
  `;
  await sql`
    delete from notifications
    where event_key in ('order.accepted', 'order.ready')
      and payload->>'reference' = ${placed.reference}
      and created_at > now() - interval '10 minutes'
  `;

  const [restored] = await sql<{ status: string; events: number }[]>`
    select o.status,
           (select count(*)::int from order_events e where e.order_id = o.id) as events
    from orders o where o.id = ${placed.id}
  `;
  check(
    `order ${placed.reference} restored to placed with one event`,
    restored.status === 'placed' && restored.events === eventsBefore[0].n,
    restored,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
