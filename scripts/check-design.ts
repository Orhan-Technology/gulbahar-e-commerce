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

  /*
   * The KPI's drill-down carries WHATEVER window the tile is showing, not a
   * fixed seven days (Prompt C3). The console's range lives in the URL and
   * defaults to thirty; a tile labelled "۳۰ روز" that lands on a seven-day list
   * is the drift this check exists to catch, one level up.
   */
  check(
    'the orders KPI carries its window',
    dashboard.includes('/dashboard/orders?range=30d'),
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
  section('The consoles state each fact once (C3)');

  /*
   * The shop's identity belongs to the chrome. It used to be printed three
   * times above the fold — top bar, greeting line, status pill — which is what
   * made the panel read as a template rather than a tool.
   */
  const shopNameCount = countOccurrences(visibleText(dashboard), 'الکترونیک کابل');
  check('the shop name appears once on the dashboard', shopNameCount === 1, shopNameCount);

  check(
    'the admin overview has no grid of links to its own sidebar',
    !overview.includes('console-sections-heading'),
  );

  check(
    'both consoles carry the same range control',
    dashboard.includes('data-range-control') && overview.includes('data-range-control'),
  );

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
    /*
     * «پذیرفتن», not «تایید». Three different things in this product were all
     * called «تاییدشده» — mall management approving a shop, an admin verifying
     * an identity, and a shopkeeper accepting an order — and at chip size the
     * reader could not tell which had happened. The order action now has its
     * own verb; matched loosely here so the assertion is about the action being
     * on the page rather than about its exact wording.
     */
    placed === 0 || /(پذیرفتن|تایید)\s*سفارش/.test(visibleText(dashboard)),
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
      .filter((digits) => !text.includes(`GC-${digits}`))
      /*
       * COLLECTION CODES are excused for exactly the reason order references
       * are, and the check simply had not met one: «۴۳۹-UF» is not a quantity,
       * it is an identifier a customer reads down a phone and a shopkeeper
       * copies onto a paper bag (lib/collection-code.ts formats it `NNN-LL`).
       * Rendering it in Persian numerals would make it unreadable back to the
       * person holding the parcel.
       */
      .filter((digits) => !new RegExp(`${digits}-[A-Z]{2}\\b`).test(text));
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
  section('Rails, rhythm and dedupe (S2, S3)');

  const home = await html('/fa');

  /*
   * A rail is only a rail if it can scroll. The failure this catches is not a
   * broken component but a starved one: the rail shipped correct and the
   * queries fed it exactly as many items as fit, so the peek, the arrows and
   * the scrollbar all promised something that was not there.
   */
  const railRegions = (home.match(/role="region"/g) ?? []).length;
  check('the home page is built from rails', railRegions >= 4, { railRegions });

  const productLinks = [...home.matchAll(/href="\/fa\/products\/([^"?]+)"/g)].map((m) => m[1]);
  const unique = new Set(productLinks);
  check(
    'no product appears twice on the home page',
    unique.size === productLinks.length,
    { links: productLinks.length, unique: unique.size },
  );

  // One countdown. Two tickers above the fold turn urgency into decoration.
  const countdowns = (home.match(/lucide-timer/g) ?? []).length;
  check('the home page has exactly one countdown', countdowns === 1, { countdowns });

  /* ---------------------------------------------------------------------- */
  section('Ratings (S1, S5)');

  for (const [path, cookie] of [
    ['/fa', ''],
    ['/fa/products', ''],
    ['/fa/shops', ''],
  ] as const) {
    const document = await html(path, cookie);
    // Star glyphs render at whatever weight the active face gives them, and
    // Vazirmatn's is a lumpy asterisk — so the same rating became a different
    // mark in each script.
    check(`${path} uses no star glyphs`, !/[★☆]/.test(visibleText(document)));
    /*
     * Blue STARS specifically, not any blue fill. A star competes with every
     * button on the same card for the one colour that is supposed to mean "you
     * can press this"; the tab bar's filled house icon does not, and a bare
     * /fill-primary/ flagged it — a check that reports the wrong thing is a
     * check people learn to skip.
     */
    check(
      `${path} has no blue stars`,
      ![...document.matchAll(/class="([^"]*lucide-star[^"]*)"/g)].some((match) =>
        match[1].includes('fill-primary'),
      ),
    );
  }

  const listing = await html('/fa/products');
  /*
   * An unrated product renders NO rating row at all — a row of empty stars is
   * the single most common way a young catalogue talks itself down.
   *
   * Asserted on the star group's own aria-label rather than on the visible
   * text, which is where the count used to be wrapped in parentheses: the
   * count is now bare (matching the reference design), so the old
   * `no "(0)"` grep could never match again and was quietly passing on
   * everything.
   */
  const zeroRatings = [...listing.matchAll(/role="img" aria-label="([^"]*)"/g)]
    .map((match) => match[1])
    .filter((label) => /(^|\s)[۰0](\s|٫|$)/.test(label.replace(/از\s*[۵5]/, '')));
  check('no rating row reports zero', zeroRatings.length === 0, zeroRatings);

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

  /* ---------------------------------------------------------------------- */
  section('Dashboard KPI integrity');

  /*
   * A StatCard's figure counts up from 0 on mount (PRD §10.6), but its delta
   * pill is not animated — so on the server render and the first client
   * frame, the figure is 0 regardless of the real value while the pill
   * already shows its true, final percentage. That pairing — "0" beside a
   * live delta — is the exact regression this once was: shop kabul-electronics
   * genuinely has a weekly order count of 10 and a +400% delta, and the SSR
   * HTML rendered "۰" next to the pill anyway, because the pill's guard was
   * keyed on the real value instead of the figure actually on screen.
   */
  /** Occurrences of a phrase in already-stripped visible text. */
function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function zeroValueWithDeltaPill(document: string): string[] {
    const hits: string[] = [];
    for (const match of document.matchAll(
      /class="[^"]*font-bold tabular-nums[^"]*">([^<]*)<\/span><span class="rounded-pill[^"]*(?:bg-success-bg|bg-danger-bg)/g,
    )) {
      const bare = match[1]
        .trim()
        .replace(/^[^\d۰-۹]+/, '')
        .replace(/[^\d۰-۹]+$/, '');
      if (bare === '0' || bare === '۰') hits.push(match[1]);
    }
    return hits;
  }

  for (const [label, path, cookie] of [
    ['the shop dashboard, fa', '/fa/dashboard', shopkeeper],
    ['the shop dashboard, en', '/en/dashboard', shopkeeper],
    ['the admin overview, fa', '/fa/admin', admin],
  ] as const) {
    const document = await html(path, cookie);
    const hits = zeroValueWithDeltaPill(document);
    check(`${label}: no stat card shows 0 beside a delta pill`, hits.length === 0, hits);
  }

  /* ---------------------------------------------------------------------- */
  section('Consoles show whole numbers and one heading each (C13)');

  /*
   * NO ABBREVIATED NUMBERS anywhere in a console (Prompt C2). "1.2K" does not
   * localise to Dari digits and hides precision from somebody reading their
   * own business — and the failure mode is that `formatCompact` gets reached
   * for by whoever adds the next tile, so this is checked on the rendered
   * page rather than by grepping for the helper.
   *
   * Matched on the SUFFIX FORMS Intl produces in both locales: "K"/"M" in en
   * and «هزار»/«میلیون» in fa. Checking for a bare "K" would fire on any Latin
   * word in a shop name.
   */
  for (const [label, path, cookie] of [
    ['the shop dashboard, fa', '/fa/dashboard', shopkeeper],
    ['the shop dashboard, en', '/en/dashboard', shopkeeper],
    ['the mall console, fa', '/fa/admin', admin],
    ['the mall console, en', '/en/admin', admin],
    ['the reports page', '/fa/dashboard/reports', shopkeeper],
    ['the revenue page', '/fa/admin/revenue', admin],
  ] as const) {
    const text = visibleText(await html(path, cookie));
    const abbreviations = [
      ...text.matchAll(/[\d۰-۹](?:\.[\d۰-۹]+)?\s?(K|M|هزار|میلیون)\b/g),
    ].map((match) => match[0]);
    check(`${label}: no abbreviated numbers`, abbreviations.length === 0, abbreviations);
  }

  /*
   * ONE HEADING PER CONSOLE PAGE. The shop panel used to print its identity in
   * the top bar, again as a greeting, and again as a status pill; the check
   * above counts the shop NAME, and this counts H1s, which is what catches the
   * same mistake made with a different string.
   */
  for (const [label, path, cookie] of [
    ['the shop dashboard', '/fa/dashboard', shopkeeper],
    ['the mall console', '/fa/admin', admin],
    ['the reports page', '/fa/dashboard/reports', shopkeeper],
    ['the floors view', '/fa/admin/floors', admin],
  ] as const) {
    const document = await html(path, cookie);
    const headings = [...document.matchAll(/<h1[\s>]/g)].length;
    check(`${label}: exactly one h1`, headings === 1, { headings });
  }

  /* ---------------------------------------------------------------------- */
  section('The new surfaces are reachable and RTL-safe (C13)');

  for (const [label, path, cookie] of [
    ['floor occupancy', '/fa/admin/floors', admin],
    ['the slot calendar', '/fa/admin/promotions/calendar', admin],
    ['settlements', '/fa/admin/settlements', admin],
    ['the audit log', '/fa/admin/audit', admin],
    ['shop health', '/fa/admin/shops?view=health', admin],
    ['the views report', '/fa/dashboard/reports?report=views', shopkeeper],
    ['the timing report', '/fa/dashboard/reports?report=timing', shopkeeper],
    ['the public floor map', '/fa/floors', undefined],
  ] as const) {
    const code = await status(path, cookie);
    check(`${label} renders`, code === 200, { path, code });
  }

  /*
   * PHYSICAL DIRECTION IN THE NEW MARKUP. `npm run audit` catches left/right
   * utilities in source; this catches them where it actually matters — in the
   * HTML these pages ship — because a class assembled at runtime never appears
   * in a file for the static sweep to find.
   */
  for (const [label, path, cookie] of [
    ['the floor map', '/fa/floors', undefined],
    ['the slot calendar', '/fa/admin/promotions/calendar', admin],
    ['the timing grid', '/fa/dashboard/reports?report=timing', shopkeeper],
  ] as const) {
    const document = await html(path, cookie);
    const physical = [
      ...document.matchAll(/class="[^"]*\b(ml-|mr-|pl-|pr-|left-|right-|text-left|text-right)[^"]*"/g),
    ].map((match) => match[1]);
    check(`${label}: no physical direction utilities`, physical.length === 0, [
      ...new Set(physical),
    ]);
  }

  await sql.end();
  process.exit(summary() > 0 ? 1 : 0);
}

void main();
