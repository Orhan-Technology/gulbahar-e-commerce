/**
 * Phase 7.2 acceptance checks — promotions, revenue, reporting, orders, users.
 *
 * Two things these exist to prove beyond "the page renders":
 *
 *   1. The money is right. Placement revenue is `campaigns.price_paid` summed over
 *      SOLD campaigns only, and the checks recompute every headline figure from the
 *      database independently of the query that feeds the screen. A revenue view
 *      that quietly double-counts is worse than no revenue view.
 *   2. The approval loop closes. A shop books, admin decides, the shop is notified,
 *      and an approved booking that has already begun becomes 'active' — the state
 *      the storefront's promoted-slot query actually matches on.
 *
 * Requires: dev server on 3005 and a seeded database. Restores what it changes.
 * Run: npm run check:phase7b
 */
import 'dotenv/config';

import { sql } from '../lib/db';
import { formatPhone } from '../lib/format';
import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';

const ADMIN = '0700000001';
const SHOPKEEPER = '0700000002';
const CUSTOMER = '0700000003';

const { check, section, summary } = createReporter();

const PAGES = [
  '/fa/admin/promotions',
  '/fa/admin/revenue',
  '/fa/admin/reports',
  '/fa/admin/orders',
  '/fa/admin/users',
];

async function main() {
  console.log('Phase 7.2 — promotions, revenue, reporting, orders, users\n');

  const admin = signIn(ADMIN);
  const client = await ActionClient.create([...PAGES, '/fa/dashboard/promotions'], admin);

  section('Screens render');
  for (const path of PAGES) {
    const code = await status(path, admin);
    const page = await html(path, admin);
    const raw = /admin(Promotions|Revenue|Reports|Orders|Users)\.[A-Za-z]/.test(page);
    check(`${path} renders with no raw message keys`, code === 200 && !raw, { code, raw });
  }

  section('Only admin reaches them');
  for (const [label, phone] of [
    ['a shopkeeper', SHOPKEEPER],
    ['a customer', CUSTOMER],
  ] as const) {
    const code = await status('/fa/admin/revenue', signIn(phone));
    check(`${label} is redirected away from the revenue view`, code === 307, code);
  }

  /* ---------------------------------------------------------------------- */
  section('Revenue arithmetic is independently reproducible');

  const [expected] = await sql<
    {
      total: number;
      active: number;
      activeCount: number;
      shops: number;
      requested: number;
    }[]
  >`
    select
      coalesce(sum(price_paid) filter (where status in ('approved','active','ended')), 0)::int as total,
      coalesce(sum(price_paid) filter (where status = 'active'), 0)::int as active,
      count(*) filter (where status = 'active')::int as "activeCount",
      count(distinct shop_id) filter (where status in ('approved','active','ended'))::int as shops,
      count(*) filter (where status = 'requested')::int as requested
    from campaigns
  `;

  const { revenueBySlot, revenueTotals, topPayingShops } =
    await import('../lib/db/queries/admin-revenue');
  const totals = await revenueTotals();

  check('total matches a direct sum over sold campaigns', totals.total === expected.total, {
    got: totals.total,
    want: expected.total,
  });
  check('running revenue matches', totals.activeRevenue === expected.active, {
    got: totals.activeRevenue,
    want: expected.active,
  });
  check('paying-shop count matches', totals.payingShops === expected.shops, {
    got: totals.payingShops,
    want: expected.shops,
  });
  check(
    'requested campaigns are EXCLUDED from revenue',
    expected.requested > 0 && totals.total === expected.total,
    { requested: expected.requested },
  );

  const slots = await revenueBySlot();
  const slotSum = slots.reduce((sum, slot) => sum + slot.revenue, 0);
  check('per-slot revenue sums to the total — no double counting', slotSum === totals.total, {
    slotSum,
    total: totals.total,
  });

  const spenders = await topPayingShops(100);
  const spenderSum = spenders.reduce((sum, shop) => sum + shop.spend, 0);
  check('per-shop spend also sums to the total', spenderSum === totals.total, {
    spenderSum,
    total: totals.total,
  });

  check(
    'occupancy never exceeds 100%',
    slots.every((slot) => slot.occupancy >= 0 && slot.occupancy <= 1),
    slots.map((slot) => slot.occupancy),
  );

  const revenuePage = await html('/fa/admin/revenue', admin);
  const faDigits = (value: number) =>
    new Intl.NumberFormat('fa-AF').format(value).replace(/‎/g, '');
  check(
    'the headline total appears on the page in Persian digits',
    revenuePage.includes(faDigits(totals.total)),
    faDigits(totals.total),
  );

  /* ---------------------------------------------------------------------- */
  section('Campaign approval closes the loop');

  const [pendingRequest] = await sql<{ id: string; shopId: string; slotId: string }[]>`
    select id, shop_id as "shopId", slot_id as "slotId"
    from campaigns where status = 'requested' limit 1
  `;
  check('a request is waiting', Boolean(pendingRequest));
  if (!pendingRequest) throw new Error('no requested campaign; reseed');

  const promotionsPage = await html('/fa/admin/promotions', admin);
  check('it shows on the promotions screen', promotionsPage.includes(pendingRequest.shopId));

  const shortReason = await client.call(admin, 'rejectCampaign', [
    { campaignId: pendingRequest.id, reason: 'نه' },
  ]);
  check('a too-short rejection is refused', shortReason?.error === 'reason_too_short', shortReason);

  const approved = await client.call(admin, 'approveCampaign', [pendingRequest.id]);
  check('approve succeeds', approved?.ok === true, approved);

  const [afterApprove] = await sql<{ status: string; future: boolean }[]>`
    select status, starts_at > now() as future from campaigns where id = ${pendingRequest.id}
  `;
  check(
    afterApprove.future
      ? "a future booking becomes 'approved', not 'active'"
      : "a booking already under way becomes 'active'",
    afterApprove.future ? afterApprove.status === 'approved' : afterApprove.status === 'active',
    afterApprove,
  );

  const [approvalNote] = await sql<{ body: string; role: string }[]>`
    select body, recipient_role::text as role from notifications
    where event_key = 'campaign.approved'
      and recipient_user_id in (
        select user_id from shop_members where shop_id = ${pendingRequest.shopId}
      )
    order by created_at desc limit 1
  `;
  check(
    'the shop was notified with a rendered body',
    Boolean(approvalNote) && !approvalNote.body.includes('{') && approvalNote.role === 'shopkeeper',
    approvalNote?.body,
  );

  const doubleApprove = await client.call(admin, 'approveCampaign', [pendingRequest.id]);
  check('approving twice is refused', doubleApprove?.error === 'not_pending', doubleApprove);

  // Rejection path, from a fresh request.
  await sql`
    update campaigns set status = 'requested', rejection_reason = null
    where id = ${pendingRequest.id}
  `;
  const rejected = await client.call(admin, 'rejectCampaign', [
    { campaignId: pendingRequest.id, reason: 'این جایگاه برای این بازه فروخته شده است.' },
  ]);
  const [afterReject] = await sql<{ status: string; reason: string }[]>`
    select status, rejection_reason as reason from campaigns where id = ${pendingRequest.id}
  `;
  check(
    'rejection records the reason on the campaign',
    rejected?.ok === true && afterReject.status === 'rejected' && Boolean(afterReject.reason),
    afterReject,
  );

  const [rejectNote] = await sql<{ body: string }[]>`
    select body from notifications
    where event_key = 'campaign.rejected'
      and recipient_user_id in (
        select user_id from shop_members where shop_id = ${pendingRequest.shopId}
      )
    order by created_at desc limit 1
  `;
  check(
    'and the shop is told why',
    Boolean(rejectNote) && rejectNote.body.includes('فروخته شده'),
    rejectNote?.body,
  );

  check(
    'a rejected campaign contributes nothing to revenue',
    (await revenueTotals()).total === expected.total,
  );

  /* ---------------------------------------------------------------------- */
  section('Slot inventory');

  const [slot] = await sql<{ id: string; capacity: number; price: number; sold: number }[]>`
    select ps.id, ps.capacity, ps.price_per_week as price,
           (select count(*)::int from campaigns c
            where c.slot_id = ps.id and c.status in ('approved','active')
              and c.starts_at <= now() and c.ends_at >= now()) as sold
    from promotion_slots ps
    where ps.key = 'featured_shops'
  `;

  const belowSold = await client.call(admin, 'updateSlot', [
    { slotId: slot.id, capacity: Math.max(slot.sold - 1, 0), pricePerWeek: slot.price },
  ]);
  check(
    'capacity cannot drop below what is already sold',
    slot.sold > 0 ? belowSold?.error === 'capacity_below_sold' : true,
    { sold: slot.sold, belowSold },
  );

  const zeroPrice = await client.call(admin, 'updateSlot', [
    { slotId: slot.id, capacity: slot.capacity, pricePerWeek: 0 },
  ]);
  check('a zero price is refused', zeroPrice?.error === 'price_min', zeroPrice);

  const raised = await client.call(admin, 'updateSlot', [
    { slotId: slot.id, capacity: slot.capacity + 1, pricePerWeek: slot.price + 500 },
  ]);
  const [afterSlot] = await sql<{ capacity: number; price: number }[]>`
    select capacity, price_per_week as price from promotion_slots where id = ${slot.id}
  `;
  check(
    'a valid change is written',
    raised?.ok === true &&
      afterSlot.capacity === slot.capacity + 1 &&
      afterSlot.price === slot.price + 500,
    afterSlot,
  );

  // A price change must not rewrite what past campaigns were sold at.
  const [oldest] = await sql<{ id: string; price: number }[]>`
    select id, price_paid as price from campaigns
    where slot_id = ${slot.id} and status in ('active','ended') order by starts_at asc limit 1
  `;
  if (oldest) {
    const [stillSnapshot] = await sql<{ price: number }[]>`
      select price_paid as price from campaigns where id = ${oldest.id}
    `;
    check(
      'existing campaigns keep the price they were sold at',
      stillSnapshot.price === oldest.price,
      stillSnapshot,
    );
  }

  await sql`
    update promotion_slots set capacity = ${slot.capacity}, price_per_week = ${slot.price}
    where id = ${slot.id}
  `;

  /* ---------------------------------------------------------------------- */
  section('Manual booking — the offline sales path');

  /*
   * The SHOP-LEVEL slot with the most free capacity right now, rather than a
   * hardcoded key.
   *
   * Two constraints, both learned by breaking this check. It used to name
   * `directory_top` because nothing occupied it — which stopped being true the
   * moment the shop directory got its featured strip (PRD §5.1), and the
   * booking below then failed with `slot_full` on a check that is about
   * pricing. And it has to exclude the product-required slots (lib/promotions.ts):
   * booking `category_top` with only a shop id fails with `product_required`,
   * which is correct behaviour and equally not what this section is testing.
   */
  const [openSlot] = await sql<{ id: string; key: string; price: number }[]>`
    select ps.id, ps.key::text as key, ps.price_per_week as price,
           ps.capacity - count(c.id) filter (
             where c.status in ('approved','active')
               and c.starts_at <= now() and c.ends_at >= now()
           ) as free
    from promotion_slots ps
    left join campaigns c on c.slot_id = ps.id
    where ps.key in ('featured_shops', 'directory_top')
    group by ps.id, ps.key, ps.price_per_week, ps.capacity
    order by free desc, ps.price_per_week asc
    limit 1
  `;
  const [approvedShop] = await sql<{ id: string }[]>`
    select id from shops where status = 'approved' limit 1
  `;
  const [pendingShop] = await sql<{ id: string }[]>`
    select id from shops where status = 'pending' limit 1
  `;

  if (pendingShop) {
    const unapproved = await client.call(admin, 'createCampaignForShop', [
      { slotId: openSlot.id, shopId: pendingShop.id, weeks: 2 },
    ]);
    check(
      'an unapproved shop cannot be promoted',
      unapproved?.error === 'shop_not_approved',
      unapproved,
    );
  }

  const manual = await client.call(admin, 'createCampaignForShop', [
    { slotId: openSlot.id, shopId: approvedShop.id, weeks: 3, pricePaid: 9000 },
  ]);
  check('manual booking succeeds', manual?.ok === true, manual);
  check('the agreed price overrides list price', manual?.data?.pricePaid === 9000, manual?.data);

  const [manualRow] = await sql<{ status: string; price: number }[]>`
    select status, price_paid as price from campaigns where id = ${manual.data.id}
  `;
  check(
    'it goes live directly — there is nobody left to approve it',
    manualRow.status === 'active' || manualRow.status === 'approved',
    manualRow,
  );

  const [manualNote] = await sql<{ body: string }[]>`
    select body from notifications
    where event_key = 'campaign.approved'
      and recipient_user_id in (
        select user_id from shop_members where shop_id = ${approvedShop.id}
      )
    order by created_at desc limit 1
  `;
  check('the shop still hears about it', Boolean(manualNote), manualNote?.body);

  const listPriced = await client.call(admin, 'createCampaignForShop', [
    { slotId: openSlot.id, shopId: approvedShop.id, weeks: 1 },
  ]);
  if (listPriced?.ok) {
    check(
      'without an override it charges list price',
      listPriced.data.pricePaid === openSlot.price,
      { got: listPriced.data.pricePaid, want: openSlot.price },
    );
    await sql`delete from campaigns where id = ${listPriced.data.id}`;
  } else {
    check('without an override it charges list price', false, listPriced);
  }

  const ended = await client.call(admin, 'endCampaign', [manual.data.id]);
  const [endedRow] = await sql<{ status: string }[]>`
    select status from campaigns where id = ${manual.data.id}
  `;
  check('ending it early works', ended?.ok === true && endedRow.status === 'ended', endedRow);

  await sql`delete from campaigns where id = ${manual.data.id}`;

  /* ---------------------------------------------------------------------- */
  section('Booking calendar');

  const { bookingCalendar } = await import('../lib/db/queries/admin-revenue');
  const calendar = await bookingCalendar(8);
  check('every slot has a row', calendar.length === 6, calendar.length);
  check(
    'each row has eight week cells',
    calendar.every((row) => row.weeks.length === 8),
    calendar.map((row) => row.weeks.length),
  );
  check(
    'no cell reports more bookings than the slot has places',
    calendar.every((row) => row.weeks.every((week) => week.booked <= row.capacity)),
  );

  const [hero] = calendar.filter((row) => row.slotKey === 'home_hero');
  const [heroLive] = await sql<{ n: number }[]>`
    select count(*)::int as n from campaigns c
    join promotion_slots ps on ps.id = c.slot_id
    where ps.key = 'home_hero' and c.status in ('approved','active')
      and c.starts_at <= date_trunc('week', now()) + interval '1 week' - interval '1 second'
      and c.ends_at >= date_trunc('week', now())
  `;
  check("this week's hero cell matches a direct count", hero.weeks[0].booked === heroLive.n, {
    cell: hero.weeks[0].booked,
    direct: heroLive.n,
  });

  /* ---------------------------------------------------------------------- */
  section('Platform reporting');

  const { platformTotals, topShops } = await import('../lib/db/queries/admin-reports');
  const report = await platformTotals(90);

  const [directGmv] = await sql<{ gmv: number; orders: number }[]>`
    select coalesce(sum(total) filter (where status = 'fulfilled'), 0)::int as gmv,
           count(*) filter (where status <> 'rejected')::int as orders
    from orders where created_at >= now() - interval '90 days'
  `;
  check('GMV matches a direct sum of fulfilled orders', report.gmv === directGmv.gmv, {
    got: report.gmv,
    want: directGmv.gmv,
  });
  check('order volume matches', report.orderCount === directGmv.orders, {
    got: report.orderCount,
    want: directGmv.orders,
  });

  // The top-shops column must not exceed GMV: a multi-shop basket split wrongly
  // would credit both shops with the whole order.
  const shopRows = await topShops(90, 100);
  const shopRevenueSum = shopRows.reduce((sum, shop) => sum + shop.revenue, 0);
  const [directLines] = await sql<{ total: number }[]>`
    select coalesce(sum(oi.price_snapshot * oi.quantity), 0)::int as total
    from order_items oi join orders o on o.id = oi.order_id
    where o.created_at >= now() - interval '90 days' and o.status <> 'rejected'
  `;
  check(
    'per-shop revenue equals the sum of order LINES, not order totals',
    shopRevenueSum === directLines.total,
    { shopRevenueSum, directLines: directLines.total },
  );

  const reportsPage = await html('/fa/admin/reports?period=90', admin);
  check('the reports page renders its panels', reportsPage.includes('پرفروش‌ترین دکان'));
  check(
    'an out-of-range period falls back rather than erroring',
    (await status('/fa/admin/reports?period=999', admin)) === 200,
  );

  /* ---------------------------------------------------------------------- */
  section('Orders are visible but read-only');

  const [anyOrder] = await sql<{ id: string; reference: string }[]>`
    select id, reference from orders where status = 'placed' limit 1
  `;
  const detail = await html(`/fa/admin/orders/${anyOrder.id}`, admin);
  check('the detail page shows the order', detail.includes(anyOrder.reference));
  check('and says it is read-only', detail.includes('تنها خواندنی'));

  // The real guard: the shop's own transition action refuses an admin session.
  const shopClient = await ActionClient.create(['/fa/dashboard/orders'], signIn(SHOPKEEPER));
  const adminAdvance = await shopClient.call(admin, 'advanceOrderStatus', [
    { orderId: anyOrder.id, to: 'accepted' },
  ]);
  const [untouched] = await sql<{ status: string }[]>`
    select status from orders where id = ${anyOrder.id}
  `;
  check(
    'admin cannot advance an order even by calling the action directly',
    adminAdvance?.error === 'forbidden' && untouched.status === 'placed',
    { adminAdvance, untouched },
  );

  /* ---------------------------------------------------------------------- */
  section('Users');

  const usersPage = await html('/fa/admin/users?role=shopkeeper', admin);
  const [shopkeeperRow] = await sql<{ id: string; phone: string }[]>`
    select id, phone from users where phone = ${SHOPKEEPER}
  `;
  /*
   * Compared against the FORMATTED phone, not the stored one. Since A1 every
   * phone in the product renders through formatPhone(), so a Dari page carries
   * "۰۷۰۰۰۰۰۰۰۲" and never the ASCII form — this assertion looked for the raw
   * column and started failing the moment the display bug was fixed, which is
   * the wrong way round for a check.
   */
  check(
    'the role filter lists shopkeepers',
    usersPage.includes(formatPhone(shopkeeperRow.phone, 'fa')),
    formatPhone(shopkeeperRow.phone, 'fa'),
  );

  const searched = await html('/fa/admin/users?q=0700000003', admin);
  check('search by phone finds the customer', searched.includes('0700000003'));

  const [adminRow] = await sql<{ id: string }[]>`select id from users where phone = ${ADMIN}`;
  const self = await client.call(admin, 'setUserActive', [adminRow.id, false]);
  check('an admin cannot deactivate themselves', self?.error === 'cannot_deactivate_self', self);

  const deactivated = await client.call(admin, 'setUserActive', [shopkeeperRow.id, false]);
  const [afterDeactivate] = await sql<{ active: boolean }[]>`
    select active from users where id = ${shopkeeperRow.id}
  `;
  check(
    'deactivation flips the flag without deleting anything',
    deactivated?.ok === true && afterDeactivate.active === false,
    afterDeactivate,
  );

  const [ordersSurvive] = await sql<{ n: number }[]>`
    select count(*)::int as n from shop_members where user_id = ${shopkeeperRow.id}
  `;
  check('their shop membership survives', ordersSurvive.n > 0, ordersSurvive);

  const reactivated = await client.call(admin, 'setUserActive', [shopkeeperRow.id, true]);
  const [afterReactivate] = await sql<{ active: boolean }[]>`
    select active from users where id = ${shopkeeperRow.id}
  `;
  check(
    'and reactivation restores access',
    reactivated?.ok === true && afterReactivate.active === true,
    afterReactivate,
  );

  section('Non-admins cannot call these actions');
  const shopkeeper = signIn(SHOPKEEPER);
  const hostileCalls: Array<[string, string, unknown[]]> = [
    ['approve a campaign', 'approveCampaign', [pendingRequest.id]],
    ['edit a slot', 'updateSlot', [{ slotId: slot.id, capacity: 9, pricePerWeek: 1 }]],
    ['deactivate a user', 'setUserActive', [shopkeeperRow.id, false]],
  ];
  for (const [label, name, args] of hostileCalls) {
    const result = await client.call(shopkeeper, name, args);
    check(`a shopkeeper cannot ${label}`, result?.error === 'forbidden', result);
  }

  /* ---------------------------------------------------------------------- */
  section('THE LIVE DEMO MOMENT: register → pending queue → approve → storefront');

  /*
   * The acceptance criterion for this phase, end to end and in one place. It starts
   * from a brand-new account, because that is what the walkthrough does — a
   * shopkeeper nobody has seen before signs up on stage.
   */
  const APPLICANT = '0799000821';
  await sql`delete from shop_members where user_id in (select id from users where phone = ${APPLICANT})`;
  await sql`delete from shops where name->>'en' = 'Phase7b Live Moment'`;
  await sql`delete from users where phone = ${APPLICANT}`;
  await sql`
    insert into users (phone, name, role) values (${APPLICANT}, 'متقاضی آزمایشی', 'shopkeeper')
  `;

  const applicant = signIn(APPLICANT);

  // A shopkeeper with no shop is sent to registration, not to an empty dashboard.
  const bounce = await fetch('http://localhost:3005/fa/dashboard', {
    headers: { cookie: applicant },
    redirect: 'manual',
  });
  check(
    'a shopkeeper with no shop is routed to registration',
    bounce.status === 307 &&
      (bounce.headers.get('location') ?? '').includes('/dashboard/register-shop'),
    { status: bounce.status, location: bounce.headers.get('location') },
  );
  check(
    'and that page exists rather than 404ing',
    (await status('/fa/dashboard/register-shop', applicant)) === 200,
  );

  const applicantClient = await ActionClient.create(['/fa/dashboard/register-shop'], applicant);
  const [rootCategory] = await sql<{ id: string }[]>`
    select id from categories where parent_id is null limit 1
  `;

  const noName = await applicantClient.call(applicant, 'registerShop', [
    { nameFa: 'د', categoryId: rootCategory.id },
  ]);
  check('a one-character shop name is refused', noName?.error === 'name_required', noName);

  const registered = await applicantClient.call(applicant, 'registerShop', [
    {
      nameFa: 'دکان لحظه‌ی نمایش',
      nameEn: 'Phase7b Live Moment',
      descriptionFa: 'آزمایش مسیر کامل ثبت تا نشر',
      categoryId: rootCategory.id,
      floor: 3,
      unitNumber: '۳۰۱',
      phone: APPLICANT,
      hours: '9:00-19:00',
    },
  ]);
  check('registration succeeds', registered?.ok === true, registered);

  const [newShop] = await sql<{ id: string; slug: string; status: string }[]>`
    select id, slug, status from shops where name->>'en' = 'Phase7b Live Moment'
  `;
  check('it lands PENDING — nobody has vetted it yet', newShop.status === 'pending', newShop);

  const [submittedNote] = await sql<{ role: string; body: string }[]>`
    select recipient_role::text as role, body from notifications
    where event_key = 'shop.submitted' order by created_at desc limit 1
  `;
  check(
    'the admin queue is notified',
    submittedNote?.role === 'admin' && !submittedNote.body.includes('{'),
    submittedNote?.body,
  );

  const adminQueue = await html('/fa/admin/shops?status=pending', admin);
  check('it appears in the admin pending queue', adminQueue.includes(newShop.id));
  check('and is NOT on the storefront yet', (await status(`/fa/shops/${newShop.slug}`)) === 404);

  const shopsClient = await ActionClient.create(['/fa/admin/shops'], admin);
  const liveApproval = await shopsClient.call(admin, 'approveShop', [newShop.id]);
  check('admin approves it', liveApproval?.ok === true, liveApproval);
  check(
    'and it is on the storefront immediately',
    (await status(`/fa/shops/${newShop.slug}`)) === 200,
  );

  const directory = await html('/fa/shops');
  check('including in the shop directory', directory.includes(newShop.slug));

  // Amendment path: reject, then resubmit through the same action.
  await sql`
    update shops set status = 'pending', rejection_reason = 'شماره‌ی واحد نادرست است.'
    where id = ${newShop.id}
  `;
  const amended = await applicantClient.call(applicant, 'registerShop', [
    {
      nameFa: 'دکان لحظه‌ی نمایش',
      nameEn: 'Phase7b Live Moment',
      categoryId: rootCategory.id,
      floor: 3,
      unitNumber: '۳۰۲',
    },
  ]);
  const [afterAmend] = await sql<{ reason: string | null; unit: string }[]>`
    select rejection_reason as reason, unit_number as unit from shops where id = ${newShop.id}
  `;
  check(
    'resubmitting clears the rejection reason and saves the fix',
    amended?.ok === true && afterAmend.reason === null && afterAmend.unit === '۳۰۲',
    afterAmend,
  );

  await sql`delete from shop_members where shop_id = ${newShop.id}`;
  await sql`delete from shops where id = ${newShop.id}`;
  await sql`delete from users where phone = ${APPLICANT}`;

  /* ---------------------------------------------------------------------- */
  section('Cleanup');

  // The requested campaign is the seeded approval moment: put it back.
  await sql`
    update campaigns set status = 'requested', rejection_reason = null
    where id = ${pendingRequest.id}
  `;
  await sql`
    delete from notifications
    where event_key in ('campaign.approved', 'campaign.rejected', 'shop.submitted', 'shop.approved')
      and created_at > now() - interval '15 minutes'
  `;

  const [restored] = await sql<{ requested: number; total: number }[]>`
    select count(*) filter (where status = 'requested')::int as requested,
           coalesce(sum(price_paid) filter (where status in ('approved','active','ended')), 0)::int as total
    from campaigns
  `;
  check(
    'the campaign queue and revenue total are back as seeded',
    restored.requested === expected.requested && restored.total === expected.total,
    restored,
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
