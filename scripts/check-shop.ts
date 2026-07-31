import 'dotenv/config';
import { and, eq, inArray, sql as raw } from 'drizzle-orm';

import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';
import { db, sql as pg } from '../lib/db';
import { platformSettings, shopFollows, shopReviewRows, shops } from '../lib/db/schema';

/**
 * Acceptance check for the shop page (Prompt C8).
 *
 * Reads the SHIPPED HTML and drives the SHIPPED actions, following the habits
 * the other check scripts established:
 *
 * - next-intl ships the whole message tree to the client on every page, so a
 *   string appearing in the HTML proves nothing about what rendered. Every
 *   assertion anchors on markup — `data-tab`, `data-shop-row`, `data-open` —
 *   never on a bare phrase (CLAUDE.md).
 * - Everything it changes, it puts back, BY ID captured before anything runs:
 *   the mall's opening hours, the follow it toggles, and the review it writes.
 *   A check that eats a seeded demo moment leaves the walkthrough hollow by the
 *   third rehearsal.
 */

const CUSTOMER = '0700000003';

/** The demo shopkeeper's own shop — the one the runbook opens. */
const SHOP = 'kabul-electronics';

async function main() {
  const report = createReporter();
  console.log('Shop page (C8)\n');

  const [shop] = await db.select().from(shops).where(eq(shops.slug, SHOP)).limit(1);
  if (!shop) throw new Error(`${SHOP} is not seeded — run npm run db:reset`);

  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  const originalHours = settings.hours;

  // ------------------------------------------------------------------ tabs
  report.section('Every tab is a shareable, server-rendered URL');

  const tabs = ['products', 'offers', 'about', 'reviews'] as const;
  for (const tab of tabs) {
    const url = tab === 'products' ? `/fa/shops/${SHOP}` : `/fa/shops/${SHOP}?tab=${tab}`;
    const body = await html(url);
    report.check(`${tab}: 200 with the tab bar`, body.includes('data-shop-tabs'));
    report.check(
      `${tab}: marked current in the bar`,
      new RegExp(`data-tab="${tab}"[^>]*aria-current="page"|aria-current="page"[^>]*data-tab="${tab}"`).test(
        body,
      ),
    );
  }

  const unknown = await html(`/fa/shops/${SHOP}?tab=nonsense`);
  report.check(
    'an unrecognised tab falls back to products rather than 404ing',
    /data-tab="products"[^>]*aria-current="page"|aria-current="page"[^>]*data-tab="products"/.test(
      unknown,
    ),
  );

  report.check('a pending shop still 404s', (await status('/fa/shops/nazari-fabrics')) === 404);

  // --------------------------------------------------- merchandising floor
  report.section('Merchandising rows never render below four items');

  const approved = await db
    .select({ slug: shops.slug })
    .from(shops)
    .where(eq(shops.status, 'approved'));

  let rowsSeen = 0;
  let shortRows = 0;
  for (const entry of approved) {
    const body = await html(`/fa/shops/${entry.slug}`);
    for (const match of body.matchAll(/data-shop-row="(\w+)" data-row-items="(\d+)"/g)) {
      rowsSeen += 1;
      if (Number(match[2]) < 4) shortRows += 1;
    }
  }
  report.check(`no row under four items across ${approved.length} shops`, shortRows === 0, {
    rowsSeen,
    shortRows,
  });
  /*
   * INFORMATIONAL, not a failure. Every seeded shop carries five or six
   * products, which is below the floor at which a rail is a selection rather
   * than the catalogue printed twice — so the correct number of rows today is
   * zero. Stated out loud so a future seed with a fuller catalogue is noticed
   * rather than silently changing what this check means.
   */
  console.log(`  ℹ merchandising rows currently rendering: ${rowsSeen}`);

  // ------------------------------------------------------- the OPEN pill
  report.section('The open/closed pill follows the mall hours in admin settings');

  const openBody = await html(`/fa/shops/${SHOP}?tab=about`);
  report.check('the pill renders', /data-open="(true|false)"/.test(openBody));

  await db.update(platformSettings).set({ hours: '02:00-03:00' }).where(eq(platformSettings.id, 1));
  const shutBody = await html(`/fa/shops/${SHOP}?tab=about`);
  report.check(
    'closing the mall closes the shop',
    /data-open="false"/.test(shutBody),
    /data-open="(\w+)"/.exec(shutBody)?.[1],
  );

  await db
    .update(platformSettings)
    .set({ hours: originalHours })
    .where(eq(platformSettings.id, 1));
  const restored = await html(`/fa/shops/${SHOP}?tab=about`);
  report.check(
    'restoring the hours restores the pill',
    /data-open="(true|false)"/.test(restored) &&
      /data-open="(\w+)"/.exec(restored)?.[1] === /data-open="(\w+)"/.exec(openBody)?.[1],
  );

  // ------------------------------------------------------- follow / unfollow
  report.section('Following a shop');

  const cookie = signIn(CUSTOMER);
  const client = await ActionClient.create([`/fa/shops/${SHOP}`], cookie);

  const [customer] = await db.execute<{ id: string }>(
    raw`select id from users where phone = ${CUSTOMER} limit 1`,
  );

  const [followedBefore] = await db
    .select({ userId: shopFollows.userId })
    .from(shopFollows)
    .where(and(eq(shopFollows.shopId, shop.id), eq(shopFollows.userId, customer.id)))
    .limit(1);
  const wasFollowing = Boolean(followedBefore);

  const followed = await client.call(cookie, 'setShopFollow', [shop.id, true]);
  report.check('follow succeeds', followed?.ok === true, followed);

  const afterFollow = await db
    .select({ userId: shopFollows.userId })
    .from(shopFollows)
    .where(and(eq(shopFollows.shopId, shop.id), eq(shopFollows.userId, customer.id)));
  report.check('the row exists', afterFollow.length === 1);

  const again = await client.call(cookie, 'setShopFollow', [shop.id, true]);
  const afterTwice = await db
    .select({ userId: shopFollows.userId })
    .from(shopFollows)
    .where(and(eq(shopFollows.shopId, shop.id), eq(shopFollows.userId, customer.id)));
  report.check('following twice is idempotent, not a duplicate', again?.ok === true && afterTwice.length === 1);

  const unfollowed = await client.call(cookie, 'setShopFollow', [shop.id, false]);
  const afterUnfollow = await db
    .select({ userId: shopFollows.userId })
    .from(shopFollows)
    .where(and(eq(shopFollows.shopId, shop.id), eq(shopFollows.userId, customer.id)));
  report.check('unfollow removes it', unfollowed?.ok === true && afterUnfollow.length === 0);

  const anonFollow = await client.call('', 'setShopFollow', [shop.id, true]);
  report.check('a signed-out visitor cannot follow', anonFollow?.ok === false, anonFollow);

  // Put the seeded state back exactly as it was.
  if (wasFollowing) {
    await db.insert(shopFollows).values({ userId: customer.id, shopId: shop.id }).onConflictDoNothing();
  }

  // ------------------------------------------------- the verified-purchase rule
  report.section('A shop review needs a fulfilled order from that shop');

  /*
   * A shop this customer has NEVER bought from, chosen from the database rather
   * than hard-coded: the seeded order mix is random within a fixed sequence, so
   * a slug written into the script would eventually become one they did buy
   * from and the assertion would start passing for the wrong reason.
   */
  const strangers = await db.execute<{ id: string; slug: string }>(raw`
    select s.id, s.slug from shops s
    where s.status = 'approved'
      and not exists (
        select 1 from orders o
        join order_items oi on oi.order_id = o.id
        where o.user_id = ${customer.id} and oi.shop_id = s.id
      )
    limit 1
  `);

  if (strangers.length === 0) {
    console.log('  ℹ this customer has bought from every shop — skipping the negative case');
  } else {
    const refused = await client.call(cookie, 'submitShopReview', [
      { shopId: strangers[0].id, rating: 5, body: 'should never be stored' },
    ]);
    report.check(
      `a shop they never bought from is refused (${strangers[0].slug})`,
      refused?.ok === false && refused?.error === 'not_purchased',
      refused,
    );
  }

  const eligible = await db.execute<{ id: string; slug: string }>(raw`
    select distinct s.id, s.slug from shops s
    join order_items oi on oi.shop_id = s.id
    join orders o on o.id = oi.order_id
    where o.user_id = ${customer.id}
      and o.status = 'fulfilled'
      and not exists (
        select 1 from shop_reviews sr
        where sr.order_id = o.id and sr.shop_id = s.id
      )
    limit 1
  `);

  if (eligible.length === 0) {
    console.log('  ℹ every fulfilled order is already reviewed — skipping the positive case');
  } else {
    const before = await db
      .select({ id: shopReviewRows.id })
      .from(shopReviewRows)
      .where(eq(shopReviewRows.shopId, eligible[0].id));

    const accepted = await client.call(cookie, 'submitShopReview', [
      { shopId: eligible[0].id, rating: 4, body: 'check-shop.ts — removed by this script' },
    ]);
    report.check(`a fulfilled order is accepted (${eligible[0].slug})`, accepted?.ok === true, accepted);

    const after = await db
      .select({ id: shopReviewRows.id })
      .from(shopReviewRows)
      .where(eq(shopReviewRows.shopId, eligible[0].id));

    const created = after.filter((row) => !before.some((old) => old.id === row.id));
    report.check('exactly one row was written', created.length === 1);

    // Scoped BY ID, captured before the write — never by timestamp, and never
    // by "the newest row" (CLAUDE.md).
    if (created.length > 0) {
      await db.delete(shopReviewRows).where(inArray(shopReviewRows.id, created.map((row) => row.id)));
    }
  }

  const anonReview = await client.call('', 'submitShopReview', [
    { shopId: shop.id, rating: 5 },
  ]);
  report.check('a signed-out visitor cannot review', anonReview?.ok === false, anonReview);

  // ------------------------------------------------------- data-level rules
  report.section('Every seeded shop review is earned');

  const unearned = await db.execute<{ n: number }>(raw`
    select count(*)::int as n from shop_reviews sr
    join orders o on o.id = sr.order_id
    where o.status <> 'fulfilled'
       or o.user_id <> sr.user_id
       or not exists (
         select 1 from order_items oi
         where oi.order_id = sr.order_id and oi.shop_id = sr.shop_id
       )
  `);
  report.check('no review without a matching fulfilled order', Number(unearned[0].n) === 0, unearned[0]);

  const future = await db.execute<{ n: number }>(
    raw`select count(*)::int as n from shop_reviews where created_at > now()`,
  );
  report.check('no review is dated in the future', Number(future[0].n) === 0);

  /*
   * The tab counts are the same numbers the page's own queries produced. The
   * reviews one is the interesting case: before C8 the hero showed an average
   * over PRODUCT reviews while the reviews tab counted SHOP reviews, so one
   * screen carried two different ratings for one shop with no way to tell which
   * was "this shop's". Both now read shop_reviews.
   */
  const tabBody = await html(`/fa/shops/${SHOP}`);
  const counts = Object.fromEntries(
    [...tabBody.matchAll(/data-tab="(\w+)"[^>]*data-tab-count="(\d+)"/g)].map((match) => [
      match[1],
      Number(match[2]),
    ]),
  );

  const [visibleReviews] = await db.execute<{ n: number }>(
    raw`select count(*)::int as n from shop_reviews where shop_id = ${shop.id} and status = 'visible'`,
  );
  report.check(
    'the reviews tab counts shop reviews, not product reviews',
    counts.reviews === Number(visibleReviews.n),
    { rendered: counts.reviews, database: Number(visibleReviews.n) },
  );

  const [published] = await db.execute<{ n: number }>(
    raw`select count(*)::int as n from products where shop_id = ${shop.id} and status = 'published'`,
  );
  report.check('the products tab counts published products', counts.products === Number(published.n), {
    rendered: counts.products,
    database: Number(published.n),
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
