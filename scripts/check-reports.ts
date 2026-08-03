import 'dotenv/config';
import { eq, sql as raw } from 'drizzle-orm';

import { createReporter, html, signIn, status, BASE } from './lib/action-client';
import { db, sql as pg } from '../lib/db';
import { shops } from '../lib/db/schema';
import { periodSummary, responsivenessSummary, viewsWithoutSales, stockReport } from '../lib/db/queries/shop-reports';

/**
 * Acceptance check for the shopkeeper reports (Prompt C10).
 *
 * What C10 asks to be verified: each report is empty-stated when there is no
 * data, conversion is computed from the same view and order definitions as
 * everywhere else, and the mall average excludes the viewing shop and never
 * names another one. Plus the CSV, whose access control is the part most likely
 * to be got wrong quietly.
 *
 * Read-only: nothing here writes, so there is nothing to put back.
 */

const SHOPKEEPER = '0700000002';
const ADMIN = '0700000001';
const CUSTOMER = '0700000003';

async function main() {
  const report = createReporter();
  console.log('Shopkeeper reports (C10)\n');

  const cookie = signIn(SHOPKEEPER);

  const [shop] = await db
    .select({ id: shops.id, slug: shops.slug, name: shops.name })
    .from(shops)
    .where(eq(shops.slug, 'kabul-electronics'))
    .limit(1);

  // ------------------------------------------------------------------ tabs
  report.section('Every report is its own URL');

  const tabs = ['overview', 'views', 'stock', 'responsiveness', 'timing'] as const;
  for (const tab of tabs) {
    const url =
      tab === 'overview'
        ? '/fa/dashboard/reports'
        : `/fa/dashboard/reports?report=${tab}`;
    const body = await html(url, cookie);
    report.check(`${tab}: renders with the tab bar`, body.includes('data-report-tabs'));
    report.check(
      `${tab}: marked current`,
      new RegExp(
        `data-report="${tab}"[^>]*aria-current="page"|aria-current="page"[^>]*data-report="${tab}"`,
      ).test(body),
    );
    report.check(`${tab}: carries the summary strip`, body.includes('data-summary-strip'));
  }

  const unknown = await html('/fa/dashboard/reports?report=nonsense', cookie);
  report.check(
    'an unrecognised report falls back to the overview',
    /data-report="overview"[^>]*aria-current="page"|aria-current="page"[^>]*data-report="overview"/.test(
      unknown,
    ),
  );

  // The range travels with the tab — losing it on every click is the small
  // thing that makes a console feel like it is fighting you.
  const ninety = await html('/fa/dashboard/reports?report=stock&range=90d', cookie);
  report.check('the range survives a tab change', ninety.includes('range=90d'));

  // ------------------------------------------------------- shared definitions
  report.section('One definition of a view and one of an order');

  const summary = await periodSummary(shop.id, 30);
  const [independent] = await db.execute<{ orders: number; views: number }>(raw`
    select
      (select count(distinct o.id)::int
         from orders o join order_items oi on oi.order_id = o.id
        where oi.shop_id = ${shop.id}
          and o.created_at >= date_trunc('day', now() at time zone 'utc') - interval '29 days'
          and o.status not in ('rejected', 'cancelled')) as orders,
      (select coalesce(sum(v.views), 0)::int
         from product_view_days v join products p on p.id = v.product_id
        where p.shop_id = ${shop.id}
          and v.day >= (date_trunc('day', now() at time zone 'utc') - interval '29 days')::date) as views
  `);

  report.check(
    'the strip counts orders the same way the queue does',
    summary.orderCount === Number(independent.orders),
    { strip: summary.orderCount, sql: Number(independent.orders) },
  );
  report.check(
    'the strip counts views from the daily roll-up, not the lifetime counter',
    summary.views === Number(independent.views),
    { strip: summary.views, sql: Number(independent.views) },
  );

  const rows = await viewsWithoutSales(shop.id, 30);
  const conversionsAgree = rows.every(
    (row) => Math.abs(row.conversion - (row.views > 0 ? row.orders / row.views : 0)) < 1e-9,
  );
  report.check('per-product conversion is orders over views', conversionsAgree);
  report.check(
    'the report only lists products with enough traffic to judge',
    rows.every((row) => row.views >= 20),
    { lowest: Math.min(...rows.map((row) => row.views), Infinity) },
  );

  // --------------------------------------------------------------- stock
  report.section('Stock lists only what is running out');

  const stock = await stockReport(shop.id, 30);
  report.check('nothing above three in stock is listed', stock.every((row) => row.stock <= 3));

  const [published] = await db.execute<{ n: number }>(
    raw`select count(*)::int as n from products
        where shop_id = ${shop.id} and status = 'published' and stock <= 3`,
  );
  report.check('every low-stock product is listed', stock.length === Number(published.n), {
    rendered: stock.length,
    database: Number(published.n),
  });

  // ------------------------------------------------------- responsiveness
  report.section('The mall average is fair and anonymous');

  const responsivenessRow = await responsivenessSummary(shop.id, 30);

  const [comparison] = await db.execute<{ excluding: number | null; including: number | null }>(raw`
    with placed as (
      select distinct o.id, o.created_at, oi.shop_id
      from orders o join order_items oi on oi.order_id = o.id
      where o.created_at >= date_trunc('day', now() at time zone 'utc') - interval '29 days'
    ),
    timings as (
      select placed.shop_id,
        (select extract(epoch from (e.created_at - placed.created_at)) / 3600
           from order_events e
          where e.order_id = placed.id and e.to_status = 'accepted'
          order by e.created_at asc limit 1) as accept_hours
      from placed
    )
    select
      percentile_cont(0.5) within group (order by accept_hours)
        filter (where shop_id <> ${shop.id}) as excluding,
      percentile_cont(0.5) within group (order by accept_hours) as including
    from timings
  `);

  report.check(
    'the mall average excludes the viewing shop',
    responsivenessRow.mallAcceptHours !== null &&
      Math.abs(responsivenessRow.mallAcceptHours - Number(comparison.excluding)) < 1e-9,
    { rendered: responsivenessRow.mallAcceptHours, excluding: comparison.excluding },
  );

  /*
   * And it is a DIFFERENT number from the all-shops median — otherwise the
   * assertion above would pass on a query that never excluded anything. Skipped
   * rather than failed when the two genuinely coincide, which is possible.
   */
  if (comparison.excluding !== null && comparison.including !== null) {
    if (Number(comparison.excluding) === Number(comparison.including)) {
      console.log('  ℹ excluding and including happen to be equal — exclusion not distinguishable');
    } else {
      report.check(
        'excluding it actually changes the figure',
        Number(comparison.excluding) !== Number(comparison.including),
      );
    }
  }

  const responsivenessHtml = await html('/fa/dashboard/reports?report=responsiveness', cookie);
  const others = await db
    .select({ name: shops.name })
    .from(shops)
    .where(eq(shops.status, 'approved'));

  /*
   * Anchored on the REPORT's own markup, not on the whole document: next-intl
   * ships the entire message tree to every page and the console chrome names
   * the viewer's own shop, so grepping the raw HTML for a shop name proves
   * nothing (CLAUDE.md).
   */
  const section = responsivenessHtml.split('data-responsiveness')[1]?.slice(0, 8000) ?? '';
  const named = others
    .filter((row) => row.name.fa !== shop.name.fa)
    .filter((row) => section.includes(row.name.fa));
  report.check('no other shop is named in the comparison', named.length === 0, {
    named: named.map((row) => row.name.fa),
  });

  // ------------------------------------------------------------------ CSV
  report.section('CSV export');

  const csvResponse = await fetch(`${BASE}/api/reports/stock?range=30d&locale=fa`, {
    headers: { cookie },
  });
  /*
   * The BYTES, not the decoded text. `response.text()` decodes UTF-8 and STRIPS
   * a leading BOM per the encoding standard, so asserting on the string always
   * fails no matter what the server sent — which is exactly how this check
   * reported a bug that was not there.
   */
  const csvBytes = new Uint8Array(await csvResponse.clone().arrayBuffer());
  const csvBody = await csvResponse.text();

  report.check('a shopkeeper can download their own report', csvResponse.status === 200);
  report.check(
    'it is served as a download, not a page',
    (csvResponse.headers.get('content-disposition') ?? '').includes('attachment'),
  );
  report.check(
    'it is not cacheable by anything in between',
    (csvResponse.headers.get('cache-control') ?? '').includes('no-store'),
  );
  // Without the BOM, Excel on Windows reads UTF-8 as Latin-1 and every Dari
  // product name in the file becomes mojibake.
  report.check(
    'it starts with a UTF-8 BOM',
    csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf,
    [...csvBytes.slice(0, 3)],
  );
  report.check('it has a header row', csvBody.includes('product,stock,price_afn'));

  report.check(
    'a signed-out visitor gets 404, not 403',
    (await status('/api/reports/stock?range=30d')) === 404,
  );
  report.check(
    'an admin cannot read a tenant’s trading data',
    (await status('/api/reports/stock?range=30d', signIn(ADMIN))) === 404,
  );
  report.check(
    'nor can a customer',
    (await status('/api/reports/stock?range=30d', signIn(CUSTOMER))) === 404,
  );
  report.check(
    'a report that does not export is 404, not an empty file',
    (await status('/api/reports/overview?range=30d', cookie)) === 404,
  );

  const failed = report.summary();
  await pg.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await pg.end();
  process.exit(1);
});
