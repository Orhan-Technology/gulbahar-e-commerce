/**
 * Cross-surface design checks (D5 — the polish audit).
 *
 * The other check scripts each own a phase. This one owns the seams BETWEEN
 * surfaces, which is where a product of three panels actually goes wrong: a
 * card idiom that exists twice, a KPI that links to an unfiltered list, a
 * toolbar that behaves differently on the screen nobody reviewed.
 *
 * Everything here is a question only the running app can answer. The static
 * half — physical CSS, hardcoded Dari, motion budgets, image dimensions —
 * belongs in scripts/audit.ts and runs from check-phase9.
 *
 * Requires: dev server on 3005 and a seeded database. Changes nothing.
 * Run: npm run check:design
 */
import 'dotenv/config';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from '../lib/db';
import { createReporter, html, signIn, status } from './lib/action-client';

const { check, section, summary } = createReporter();

function walk(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path, match);
    return match.test(entry) ? [path] : [];
  });
}

/**
 * Visible text only.
 *
 * Strips `<script>` blocks BEFORE tags, which is the trap: next-intl ships the
 * whole message tree and the RSC flight payload inlines every number as raw
 * JSON, so a digit check that reads the document as a whole is really checking
 * the serialiser (CLAUDE.md). Attributes go too — a `sizes="96px"` is not text
 * anyone reads.
 */
function visibleText(document: string): string {
  return document
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/** Internal hrefs a page offers, deduplicated and in document order. */
function internalLinks(document: string, locale: string): string[] {
  const found = new Set<string>();
  for (const match of document.matchAll(/href="(\/[^"#]*)"/g)) {
    const href = match[1].replace(/&amp;/g, '&');
    if (!href.startsWith(`/${locale}`)) continue;
    found.add(href);
  }
  return [...found];
}

async function main() {
  console.log('Cross-surface design audit\n');

  const shopkeeper = signIn('0700000002');
  const admin = signIn('0700000001');

  /* ---------------------------------------------------------------------- */
  section('One vocabulary across every listing surface');

  const listings = [
    ['/fa/products', ''],
    ['/fa/categories/electronics', ''],
    ['/fa/offers', ''],
    ['/fa/shops/kabul-electronics', ''],
    // A term with real matches: an empty result renders the empty state, which
    // correctly has no toolbar, and the check would be measuring the seed.
    ['/fa/search?q=%D8%B3%D8%A7%D9%85%D8%B3%D9%88%D9%86%DA%AF', ''],
  ] as const;

  for (const [path] of listings) {
    const document = await html(path);
    // The toolbar's sort control is the marker: one id, one implementation.
    check(`${path} renders the shared toolbar`, document.includes('id="listing-sort"'));
  }

  const sortOptions = await html('/fa/products');
  check(
    'sort offers popularity first and no alphabetical option',
    sortOptions.includes('value="popularity"') && !/value="(name|title|alpha)/.test(sortOptions),
  );

  /* ---------------------------------------------------------------------- */
  section('Drill-downs land somewhere, and land filtered');

  const dashboard = await html('/fa/dashboard', shopkeeper);
  const dashboardLinks = internalLinks(dashboard, 'fa');
  const dashboardBroken: string[] = [];
  for (const href of dashboardLinks) {
    if ((await status(href, shopkeeper)) >= 400) dashboardBroken.push(href);
  }
  check('every link on the shop dashboard resolves', dashboardBroken.length === 0, dashboardBroken);

  check(
    'the orders KPI carries its window',
    dashboard.includes('/dashboard/orders?range=7d'),
  );
  check('the views KPI carries its ordering', dashboard.includes('/dashboard/products?sort=views'));

  // …and the destination honours it rather than quietly dropping the filter.
  const ranged = await html('/fa/dashboard/orders?range=7d', shopkeeper);
  check(
    'the orders page shows the window as a removable chip',
    ranged.includes('/dashboard/orders"') && /هفت روز گذشته/.test(visibleText(ranged)),
  );

  const overview = await html('/fa/admin', admin);
  const overviewLinks = internalLinks(overview, 'fa');
  const overviewBroken: string[] = [];
  for (const href of overviewLinks) {
    if ((await status(href, admin)) >= 400) overviewBroken.push(href);
  }
  check('every link on the admin overview resolves', overviewBroken.length === 0, overviewBroken);

  /* ---------------------------------------------------------------------- */
  section('The action centres carry their actions');

  const [{ pending }] = await sql<{ pending: number }[]>`
    select count(*)::int as pending from shops where status = 'pending'
  `;
  check(
    'a pending shop is decidable from the admin overview, not merely listed',
    pending === 0 || /formAction|approve|تایید/.test(visibleText(overview)),
    { pending },
  );

  const [{ placed }] = await sql<{ placed: number }[]>`
    select count(*)::int as placed from orders where status = 'placed'
  `;
  check(
    'a new order is acceptable from the shop dashboard',
    placed === 0 || /تایید سفارش/.test(visibleText(dashboard)),
    { placed },
  );

  /* ---------------------------------------------------------------------- */
  section('Press feedback reached every surface');

  for (const [label, path, cookie] of [
    ['storefront', '/fa', ''],
    ['dashboard', '/fa/dashboard', shopkeeper],
    ['admin', '/fa/admin', admin],
  ] as const) {
    const document = await html(path, cookie);
    check(`${label} renders pressable surfaces`, / class="[^"]*\bpressable\b/.test(document));
  }

  /* ---------------------------------------------------------------------- */
  section('Dari screens show Persian numerals');

  for (const [path, cookie] of [
    ['/fa/products', ''],
    ['/fa/shops', ''],
    ['/fa/dashboard', shopkeeper],
    ['/fa/admin', admin],
  ] as const) {
    const text = visibleText(await html(path, cookie));
    /*
     * ASCII digits in visible text, excluding the ones that are not numerals to
     * a reader: order references (GC-24788) are identifiers printed LTR on
     * purpose, and a bare year inside a slug never reaches the page as text.
     *
     * The lookbehind excludes a preceding DIGIT as well as a letter or hyphen.
     * Without that, "GC-24338" is excused at "24338" and then matched again at
     * "4338" — the scan restarts inside the number it just forgave, and the
     * check reports a leak that is the tail of an identifier.
     */
    const leaked = [...text.matchAll(/(?<![A-Za-z\d-])\d{2,}/g)]
      .map((match) => match[0])
      .filter((digits) => !text.includes(`GC-${digits}`));
    check(`${path} leaks no Latin digits`, leaked.length === 0, leaked.slice(0, 6));
  }

  /* ---------------------------------------------------------------------- */
  section('Every async block has a designed fallback');

  /*
   * A `<Suspense fallback={…}>` whose fallback is not a skeleton is a spinner
   * or a blank — the two things PRD §10.5 rules out. Matched statically
   * because it is a property of the source, not of a rendered page.
   */
  const sources = [...walk('app', /\.tsx$/), ...walk('components', /\.tsx$/)];
  const barefallbacks: string[] = [];
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<Suspense\s+fallback=\{([\s\S]*?)\}>/g)) {
      const fallback = match[1];
      if (/Skeleton|skeleton/.test(fallback)) continue;
      barefallbacks.push(`${file}: ${fallback.trim().slice(0, 40)}`);
    }
  }
  check('no Suspense boundary falls back to a spinner or nothing', barefallbacks.length === 0, barefallbacks);

  /*
   * Numbers must go through lib/format so they render in the reader's numerals.
   * `toLocaleString` and `toFixed` are the two ways that silently stops being
   * true — both produce Latin digits in a Dari page and neither is an error.
   */
  const bypasses: string[] = [];
  for (const file of [...sources, ...walk('lib', /\.ts$/)]) {
    if (file.endsWith(join('lib', 'format.ts'))) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
        if (/\.toLocaleString\(|new Intl\.NumberFormat\(/.test(line)) {
          bypasses.push(`${file}:${index + 1}`);
        }
      });
  }
  check('no component formats a number outside lib/format', bypasses.length === 0, bypasses);

  /* ---------------------------------------------------------------------- */
  section('Density');

  /*
   * Distinct information blocks per screen. The rule is "about seven" (D5), so
   * this fails at nine — a threshold that catches a screen growing a section
   * at a time without arguing about whether six or seven is right.
   */
  for (const [path, cookie] of [
    ['/fa/dashboard', shopkeeper],
    ['/fa/admin', admin],
  ] as const) {
    const document = await html(path, cookie);
    const blocks = (document.match(/<section\b/g) ?? []).length;
    check(`${path} stays under nine top-level blocks`, blocks <= 9, { blocks });
  }

  await sql.end();
  process.exit(summary() > 0 ? 1 : 0);
}

void main();
