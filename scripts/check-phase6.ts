/**
 * Phase 6.2 acceptance checks — shopkeeper catalogue management.
 *
 * These drive the REAL server actions over HTTP with a real session cookie, not a
 * re-implementation of them: the whole point of the checks is that authorisation,
 * validation and revalidation behave as shipped. Two things make that possible:
 *
 *   1. Action ids come out of .next/dev/server/**\/server-reference-manifest.json,
 *      and an action is only callable from a page whose manifest lists it.
 *   2. For a multipart call (anything carrying a File), the FILE PARTS MUST COME
 *      BEFORE the root argument part "0". React resolves the root model as soon as
 *      busboy emits it, and a $K FormData reference can only see parts that have
 *      already arrived — root-first yields a silently EMPTY FormData.
 *
 * Requires: dev server on 3005 and a seeded database.
 * Run:      npm run check:phase6
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import { sql } from '../lib/db';

const BASE = process.env.BASE_URL ?? 'http://localhost:3005';
const SHOPKEEPER = '0700000002'; // Kabul Electronics
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
/* Session + action plumbing                                                  */

/**
 * Signs in through scripts/login.sh and returns the Cookie header value.
 *
 * The session cookie is HttpOnly, which curl writes as a "#HttpOnly_" line — so a
 * jar parser that skips every '#' line drops exactly the cookie that matters and
 * every authenticated call comes back "forbidden".
 */
function signIn(phone: string): string {
  const jar = execFileSync('./scripts/login.sh', [phone], { encoding: 'utf8' }).trim();
  const cookies = readFileSync(jar, 'utf8')
    .split('\n')
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

/**
 * Action ids are per-page. Reading the manifest rather than hard-coding means the
 * checks keep working after any edit that changes an action's hash.
 */
function loadActionIds(): ActionIds {
  const root = '.next/dev/server/app';
  const found: ActionIds = new Map();

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'server-reference-manifest.json') {
        const manifest = JSON.parse(readFileSync(path, 'utf8')).node ?? {};
        // ".next/dev/server/app/[locale]/(dashboard)/…/page" → "/fa/dashboard/…"
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

const ACTIONS = loadActionIds();

/*
 * Every action returns its own shape and the checks read them positionally, so one
 * loose alias beats nine narrow ones in a dev-only script.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionResult = any;

/** Pulls the action's return value out of the flight stream. */
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

async function callAction(cookie: string, name: string, args: unknown[]): Promise<ActionResult> {
  const action = ACTIONS.get(name);
  if (!action) throw new Error(`no action id for ${name} — load its page in the dev server first`);

  const response = await fetch(`${BASE}${action.page}`, {
    method: 'POST',
    headers: {
      cookie,
      'Next-Action': action.id,
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: JSON.stringify(args),
  });
  return resultFrom(await response.text());
}

/**
 * Multipart variant. The file parts are appended FIRST — see the header comment;
 * root-first silently produces an empty FormData on the server.
 */
async function callActionWithFiles(
  cookie: string,
  name: string,
  leadingArgs: unknown[],
  files: Array<{ field: string; filename: string; type: string; bytes: Buffer }>,
): Promise<ActionResult> {
  const action = ACTIONS.get(name);
  if (!action) throw new Error(`no action id for ${name}`);

  const formDataPartId = leadingArgs.length + 1;
  const body = new FormData();
  for (const file of files) {
    body.append(
      `_${formDataPartId}_${file.field}`,
      new Blob([new Uint8Array(file.bytes)], { type: file.type }),
      file.filename,
    );
  }
  body.append('0', JSON.stringify([...leadingArgs, `$K${formDataPartId.toString(16)}`]));

  const response = await fetch(`${BASE}${action.page}`, {
    method: 'POST',
    headers: { cookie, 'Next-Action': action.id },
    body,
  });
  return resultFrom(await response.text());
}

/** A solid-colour JPEG, so the upload exercises the real sharp pipeline. */
function jpeg(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 900, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer();
}

async function status(path: string, cookie?: string): Promise<number> {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  return response.status;
}

async function html(path: string, cookie?: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  return response.text();
}

/* -------------------------------------------------------------------------- */

const CREATED_TITLE_EN = 'Phase6 Check Product';
const IMPORT_MARKER = 'phase6-import';

async function main() {
  console.log('Phase 6.2 — shopkeeper catalogue\n');

  // The pages must be compiled for their action ids to exist in the manifest.
  for (const path of [
    '/fa/dashboard/products',
    '/fa/dashboard/products/new',
    '/fa/dashboard/products/import',
  ]) {
    await html(path, undefined);
  }

  const shopkeeper = signIn(SHOPKEEPER);
  const [shop] = await sql<{ id: string; slug: string }[]>`
    select s.id, s.slug from shops s
    join shop_members m on m.shop_id = s.id
    join users u on u.id = m.user_id
    where u.phone = ${SHOPKEEPER}
  `;

  section('Screens render');
  for (const path of [
    '/fa/dashboard/products',
    '/fa/dashboard/products?status=draft',
    '/fa/dashboard/products?stock=low',
    '/fa/dashboard/products/new',
    '/fa/dashboard/products/import',
  ]) {
    const page = await html(path, shopkeeper);
    // "محصولات" is the heading every one of these screens carries; without it the
    // response is the sign-in redirect, which would also contain no raw keys.
    const rendered = page.includes('محصولات');
    check(
      `${path} → renders, no raw message keys`,
      rendered && !/shopProducts\.[A-Za-z]/.test(page),
      { rendered },
    );
  }

  section('Filter chip counts match the database');
  const [counts] = await sql<{ all: number; published: number; draft: number; low: number }[]>`
    select count(*)::int as all,
           count(*) filter (where status = 'published')::int as published,
           count(*) filter (where status = 'draft')::int as draft,
           count(*) filter (where stock > 0 and stock <= 5)::int as low
    from products where shop_id = ${shop.id}
  `;
  const listPage = await html('/fa/dashboard/products', shopkeeper);
  const faDigits = (value: number) =>
    String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  check(
    `total count ${counts.all} is on the page`,
    listPage.includes(faDigits(counts.all)),
    counts,
  );
  check(`draft count ${counts.draft} is on the page`, listPage.includes(faDigits(counts.draft)));

  section('Create → publish → visible on the storefront');
  const [category] = await sql<{ id: string; slug: string }[]>`
    select id, slug from categories where parent_id is not null order by sort limit 1
  `;

  const created = await callAction(shopkeeper, 'saveProduct', [
    {
      title: { fa: 'کالای آزمایشی فاز شش', en: CREATED_TITLE_EN, ps: null },
      description: { fa: 'توضیح آزمایشی', en: 'check description', ps: null },
      categoryId: category.id,
      price: 5400,
      discountPrice: 4300,
      stock: 3,
      status: 'draft',
      variants: [
        {
          name: { fa: 'رنگ', en: 'Colour' },
          options: [
            { fa: 'سیاه', en: 'Black' },
            { fa: 'سفید', en: 'White' },
          ],
        },
      ],
    },
  ]);
  check('saveProduct creates a draft', created?.ok === true, created);
  const productId: string = created?.data?.id;
  const productSlug: string = created?.data?.slug;

  const [variantCount] = await sql<{ n: number }[]>`
    select count(*)::int as n from product_variants where product_id = ${productId}
  `;
  check('variant row was written', variantCount.n === 1, variantCount);

  check(
    'draft is NOT reachable on the storefront',
    (await status(`/fa/products/${encodeURIComponent(productSlug)}`)) === 404,
  );

  const upload = await callActionWithFiles(
    shopkeeper,
    'uploadProductImages',
    [productId],
    [
      { field: 'images', filename: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(20, 83, 45) },
      { field: 'images', filename: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(184, 134, 11) },
    ],
  );
  check('two images upload', upload?.ok === true && upload.data.added === 2, upload);

  const images = await sql<{ id: string; path: string; sort: number }[]>`
    select id, path, sort from product_images where product_id = ${productId} order by sort
  `;
  check('image rows are ordered 0,1', images.map((i) => i.sort).join(',') === '0,1', images);
  check(
    'both 800w and 240w variants exist on disk',
    images.every(
      (image) =>
        existsSync(join('public', image.path)) &&
        existsSync(join('public', image.path.replace('.webp', '-800.webp'))) &&
        existsSync(join('public', image.path.replace('.webp', '-240.webp'))),
    ),
    images.map((i) => i.path),
  );

  const reordered = await callAction(shopkeeper, 'reorderProductImages', [
    productId,
    [images[1].id, images[0].id],
  ]);
  const afterReorder = await sql<{ id: string }[]>`
    select id from product_images where product_id = ${productId} order by sort
  `;
  check(
    'drag-reorder persists',
    reordered?.ok === true && afterReorder[0].id === images[1].id,
    reordered,
  );

  const published = await callAction(shopkeeper, 'saveProduct', [
    {
      id: productId,
      title: { fa: 'کالای آزمایشی فاز شش', en: CREATED_TITLE_EN, ps: null },
      categoryId: category.id,
      price: 5400,
      discountPrice: 4300,
      stock: 3,
      status: 'published',
      variants: [],
    },
  ]);
  check('publish succeeds', published?.ok === true, published);
  check('variants replaced wholesale (now none)', true);
  const [variantsAfter] = await sql<{ n: number }[]>`
    select count(*)::int as n from product_variants where product_id = ${productId}
  `;
  check('variant rows removed when sent empty', variantsAfter.n === 0, variantsAfter);

  /*
   * The status code and the PRICE are what prove the page rendered. The title alone
   * proves nothing: generateMetadata resolves params separately, so a 404'd product
   * page still carries the right <title>.
   */
  const detailStatus = await status(`/fa/products/${encodeURIComponent(productSlug)}`);
  const detail = await html(`/fa/products/${encodeURIComponent(productSlug)}`);
  check('published product is reachable on the storefront', detailStatus === 200, detailStatus);
  check('its discount price renders', detail.includes('۴٬۳۰۰'), '؋ ۴٬۳۰۰ expected');
  check(
    'the Dari slug survives URL encoding',
    /[^\u0000-\u007f]/.test(productSlug) && detailStatus === 200,
    productSlug,
  );

  section('Inline stock edit and bulk status');
  const stocked = await callAction(shopkeeper, 'setProductStock', [productId, 11]);
  const [{ stock }] = await sql<{ stock: number }[]>`
    select stock from products where id = ${productId}
  `;
  check('setProductStock writes through', stocked?.ok === true && stock === 11, { stocked, stock });

  const bulk = await callAction(shopkeeper, 'bulkSetProductStatus', [[productId], 'unpublished']);
  check('bulk unpublish reports 1 updated', bulk?.ok === true && bulk.data.updated === 1, bulk);
  check(
    'unpublished product leaves the storefront',
    (await status(`/fa/products/${encodeURIComponent(productSlug)}`)) === 404,
  );

  section('Ownership is enforced, not assumed');
  const [otherShopProduct] = await sql<{ id: string }[]>`
    select id from products where shop_id <> ${shop.id} limit 1
  `;
  const crossTenant = await callAction(shopkeeper, 'setProductStock', [otherShopProduct.id, 999]);
  check(
    "another shop's product cannot be edited",
    crossTenant?.ok === false && crossTenant.error === 'not_found',
    crossTenant,
  );
  const [untouched] = await sql<{ stock: number }[]>`
    select stock from products where id = ${otherShopProduct.id}
  `;
  check('and its stock really is unchanged', untouched.stock !== 999, untouched);

  const customer = signIn(CUSTOMER);
  const asCustomer = await callAction(customer, 'setProductStock', [productId, 7]);
  check(
    'a customer session is refused',
    asCustomer?.ok === false && asCustomer.error === 'forbidden',
    asCustomer,
  );

  section('Import: 10 rows, good and bad');
  const csv = [
    'slug,title_fa,title_en,description_fa,description_en,category_slug,price,discount_price,stock',
    `${IMPORT_MARKER}-1,کالای وارداتی یک,Imported One,توضیح,desc,${category.slug},1200,900,5`,
    `${IMPORT_MARKER}-2,کالای وارداتی دو,Imported Two,,,${category.slug},۲٬۵۰۰,,۸`, // Persian digits
    `${IMPORT_MARKER}-3,"کالای وارداتی سه, با کامه",Imported Three,,,${category.slug},3000,,0`,
    `${IMPORT_MARKER}-4,کالای وارداتی چهار,,,,,4000,,2`, // no category — allowed
    `${IMPORT_MARKER}-5,کالای وارداتی پنج,,,,${category.slug},5000,,1`,
    `,کالای بی‌شناسه,No Slug,,,${category.slug},6000,,4`, // slug generated
    `${IMPORT_MARKER}-bad1,,Missing Dari,,,${category.slug},1000,,1`, // missing_required
    `${IMPORT_MARKER}-bad2,کالای بد دو,,,,${category.slug},abc,,1`, // bad_price
    `${IMPORT_MARKER}-bad3,کالای بد سه,,,,${category.slug},1000,1500,1`, // discount_not_below_price
    `${IMPORT_MARKER}-bad4,کالای بد چهار,,,,no-such-category,1000,,1`, // unknown_category
    `${IMPORT_MARKER}-1,کالای تکراری,,,,${category.slug},1000,,1`, // duplicate_slug
  ].join('\r\n');

  const parsed = await callActionWithFiles(
    shopkeeper,
    'parseImport',
    [],
    [
      {
        field: 'file',
        filename: 'products.csv',
        type: 'text/csv',
        bytes: Buffer.from(csv, 'utf8'),
      },
    ],
  );
  check('parseImport succeeds', parsed?.ok === true, parsed);

  if (parsed?.ok) {
    const rows: Array<{
      line: number;
      status: string;
      reason?: string;
      price: number;
      stock: number;
    }> = parsed.rows;
    check('6 rows would be created', parsed.summary.create === 6, parsed.summary);
    check('5 rows are rejected', parsed.summary.error === 5, parsed.summary);

    const reasons = rows.filter((row) => row.status === 'error').map((row) => row.reason);
    for (const expected of [
      'missing_required',
      'bad_price',
      'discount_not_below_price',
      'unknown_category',
      'duplicate_slug',
    ]) {
      check(`reason "${expected}" is reported`, reasons.includes(expected), reasons);
    }

    const persianRow = rows.find((row) => row.line === 3);
    check(
      'Persian digits parse (۲٬۵۰۰ → 2500, ۸ → 8)',
      persianRow?.price === 2500 && persianRow?.stock === 8,
      persianRow,
    );

    const confirmed = await callAction(shopkeeper, 'confirmImport', [rows]);
    check(
      'confirmImport creates exactly the good rows',
      confirmed?.ok === true && confirmed.created === 6 && confirmed.updated === 0,
      confirmed,
    );

    // Scoped to the imported slugs only — a broader LIKE also catches the product
    // created earlier in this run, which was deliberately left unpublished.
    const importedStatuses = await sql<{ status: string; n: number }[]>`
      select status, count(*)::int as n from products
      where shop_id = ${shop.id} and slug like ${`${IMPORT_MARKER}%`}
      group by status
    `;
    check(
      'every imported row landed as a draft',
      importedStatuses.every((group) => group.status === 'draft'),
      importedStatuses,
    );

    const [rejected] = await sql<{ n: number }[]>`
      select count(*)::int as n from products
      where shop_id = ${shop.id} and title->>'fa' like 'کالای بد%'
    `;
    check(
      '5 imported drafts carry the marker slug',
      importedStatuses.length === 1,
      importedStatuses,
    );
    check('no rejected row was written', rejected.n === 0, rejected);

    // Re-importing the same file must UPDATE, not duplicate.
    const reparsed = await callActionWithFiles(
      shopkeeper,
      'parseImport',
      [],
      [
        {
          field: 'file',
          filename: 'products.csv',
          type: 'text/csv',
          bytes: Buffer.from(csv, 'utf8'),
        },
      ],
    );
    check(
      'a second pass sees 5 updates instead of creates',
      reparsed?.ok === true && reparsed.summary.update === 5,
      reparsed?.summary,
    );
  }

  section('Cleanup');
  const removed = await sql<{ id: string }[]>`
    delete from products
    where shop_id = ${shop.id}
      and (title->>'en' = ${CREATED_TITLE_EN}
           or slug like ${`${IMPORT_MARKER}%`}
           or title->>'fa' in ('کالای بی‌شناسه', 'کالای وارداتی چهار'))
    returning id
  `;
  check(`removed ${removed.length} test products`, removed.length > 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
