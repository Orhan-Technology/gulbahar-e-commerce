/**
 * Phase 9 acceptance checks — states, motion, RTL and i18n (PRD §10.3, §10.5, §10.6).
 *
 * The static half lives in scripts/audit.ts and runs from here in --strict mode. This
 * script covers what only a running app can answer:
 *
 *   - Does the translation fallback chain actually render on a page, or does a
 *     missing English title leave a blank card? (§11)
 *   - Do Dari pages really use Persian numerals for every amount, and English pages
 *     Latin ones — on the same data? (§11)
 *   - Do the loading and error boundaries exist for every route group, with copy that
 *     resolves rather than a raw key? (§10.5)
 *   - Is the motion budget respected in the built CSS, not just in the source? (§10.6)
 *
 * Requires: dev server on 3005 and a seeded database. Restores what it changes.
 * Run: npm run check:phase9
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

async function main() {
  console.log('Phase 9 — states, motion, RTL and i18n\n');

  section('Static audit');
  let auditClean = true;
  try {
    execFileSync('npx', ['tsx', 'scripts/audit.ts', '--strict'], { stdio: 'pipe' });
  } catch {
    auditClean = false;
  }
  check('scripts/audit.ts passes in strict mode', auditClean);

  /* ---------------------------------------------------------------------- */
  section('Designed states exist for every route group');

  const groups = ['(shop)', '(dashboard)', '(admin)', '(onboarding)'];
  for (const group of groups) {
    check(
      `${group} has an error boundary`,
      existsSync(join('app', '[locale]', group, 'error.tsx')),
    );
  }
  check('there is a not-found page', existsSync(join('app', '[locale]', 'not-found.tsx')));

  // Every error boundary must resolve its copy, or the friendly message is a key.
  const { default: faMessages } = await import('../messages/fa.json');
  const errorStates = faMessages.errorStates as Record<string, unknown>;
  for (const namespace of ['shop', 'dashboard', 'admin', 'onboarding']) {
    const entry = errorStates[namespace] as Record<string, string> | undefined;
    check(
      `${namespace} error copy has a title, body and back link`,
      Boolean(entry?.title && entry?.body && entry?.back),
      entry,
    );
  }

  const loadingFiles = walk('app', /^loading\.tsx$/);
  check(`route-level loading boundaries exist (${loadingFiles.length})`, loadingFiles.length >= 9);
  /*
   * The rule is "a DESIGNED skeleton, never a spinner", not "the string
   * PageSkeleton". components/custom/page-skeleton.tsx exports more than one
   * shape — the account hub's sections skeleton draws only the main column,
   * because the hub layout's nav and profile panel do not re-render between
   * sections — and a route whose content is a product grid draws that grid
   * with <Skeleton> directly. What none of them may do is spin.
   */
  const spinners = loadingFiles.filter((file) => {
    const source = readFileSync(file, 'utf8');
    const drawsSkeleton = /page-skeleton|Skeleton\b/.test(source);
    const spins = /animate-spin|Loader2|Spinner/.test(source);
    return spins || !drawsSkeleton;
  });
  check('and each draws a designed skeleton rather than a spinner', spinners.length === 0, spinners);

  const skeletonSource = readFileSync('components/custom/page-skeleton.tsx', 'utf8');
  check(
    'the skeleton has a variant per page shape, so it matches the layout it replaces',
    ['detail', 'list', 'form', 'grid'].every((variant) => skeletonSource.includes(`'${variant}'`)),
  );

  /* ---------------------------------------------------------------------- */
  section('Motion budget (300ms feedback / 500ms decorative)');

  const styleSource = readFileSync('app/globals.css', 'utf8');

  /*
   * Comments stripped FIRST. This assertion previously matched the raw file
   * and duly reported the "≤ 500ms" written in the prose explaining the
   * budget — an auditor grading its own documentation. Same lesson as the
   * RTL rule in scripts/audit.ts, learned twice.
   */
  const declarations = styleSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /--animate-|--duration-|animation:|transition/.test(line));

  /*
   * Two budgets (PRD §10.6, revised): feedback answers a tap and must be
   * quick, decorative motion is unhurried on purpose. An INFINITE animation
   * — the live pulse, the caret blink — has no end to be too far away, and
   * is governed instead by the prefers-reduced-motion rule checked below.
   */
  const overBudget = declarations.flatMap((line) => {
    if (/\binfinite\b/.test(line)) return [];
    const budget = /hover|reveal|carousel|decorative|pulse|caret/.test(line) ? 500 : 300;
    return [...line.matchAll(/(\d+(?:\.\d+)?)\s*(m?s)\b(?!-)/g)]
      .map((match) => (match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1])))
      .filter((ms) => ms > budget)
      .map((ms) => `${ms}ms > ${budget}ms — ${line}`);
  });

  check('every animation is inside its motion budget', overBudget.length === 0, overBudget);

  check(
    'and prefers-reduced-motion switches all of it off, including the infinite ones',
    /prefers-reduced-motion:\s*reduce/.test(styleSource) &&
      /animation-iteration-count:\s*1\s*!important/.test(styleSource),
  );

  const keyframes = [...styleSource.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  check(
    'the animation inventory is small and named, not incidental',
    keyframes.length > 0 && keyframes.length <= 10,
    keyframes,
  );

  /* ---------------------------------------------------------------------- */
  section('RTL: the same data, two numeral systems');

  // Ordered, not merely `limit 1`: an arbitrary row makes this section's result
  // depend on physical row order, which a reseed is free to change.
  const [product] = await sql<{ slug: string; price: number }[]>`
    select p.slug, p.price from products p
    join shops s on s.id = p.shop_id
    where p.status = 'published' and s.status = 'approved' and p.discount_price is null
    order by p.slug
    limit 1
  `;

  /*
   * The FIGURE, not formatCurrency's «؋ ۴۶٬۰۰۰». PriceDisplay renders the amount
   * and its unit as separate elements now, so the symbol form appears nowhere on
   * a product page — asserting on it tested the old markup rather than the thing
   * that matters, which is that each locale gets its own numerals and only its
   * own.
   */
  const { formatNumber } = await import('../lib/format');
  const faPrice = formatNumber(product.price, 'fa');
  const enPrice = formatNumber(product.price, 'en');

  const faPage = await html(`/fa/products/${encodeURIComponent(product.slug)}`);
  const enPage = await html(`/en/products/${encodeURIComponent(product.slug)}`);

  check(`the Dari page prices in Persian numerals (${faPrice})`, faPage.includes(faPrice));
  check(`the English page prices in Latin numerals (${enPrice})`, enPage.includes(enPrice));
  /*
   * Scripts stripped first. The RSC flight payload is embedded in <script> tags
   * and carries the RAW props every client component needs — `"price":980` for
   * the buy panel — so the Latin form of any amount is ALWAYS present there.
   * Searching the whole document made this assertion silently depend on the
   * price having a thousands separator: "46,000" never appears in JSON, but a
   * bare "980" always does, and the check flipped to failing the moment the
   * chosen product had a three-digit price. What is being asserted is that no
   * Latin numeral reaches the RENDERED page.
   */
  const rendered = (page: string) => page.replace(/<script[\s\S]*?<\/script>/g, '');

  check(
    'and the Dari page does not leak the Latin form of the same amount',
    !rendered(faPage).includes(enPrice),
    enPrice,
  );
  check(
    'both spell the currency in their own language',
    faPage.includes('افغانی') && enPage.includes('AFN'),
  );

  check('the Dari document is rtl', /<html[^>]*dir="rtl"/.test(faPage));
  check('the English document is ltr', /<html[^>]*dir="ltr"/.test(enPage));

  /*
   * Directional icons must mirror. `rtl:rotate-180` on chevrons is the mechanism;
   * a chevron without it points the wrong way in Dari, which is one of the tells
   * the PRD calls out (§10.3).
   */
  const chevronFiles = walk('components', /\.tsx$/).filter((file) => {
    const source = readFileSync(file, 'utf8');
    return /<Chevron(?:Left|Right)\b/.test(source);
  });
  const unmirrored = chevronFiles.filter((file) => {
    const source = readFileSync(file, 'utf8');
    /*
     * A tag counts as mirrored when it carries rtl:rotate-180 itself OR references a
     * constant in the same file that does — components/ui/pagination.tsx shares one
     * `mirroredChevron` string across both arrows, and a regex that only looks inside
     * the tag reports it as broken.
     */
    const mirroringIdentifiers = [
      ...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*[^;]*rtl:rotate-180/g),
    ].map((match) => match[1]);

    const uses = [...source.matchAll(/<Chevron(?:Left|Right)\b[^/>]*/g)];
    return uses.some((match) => {
      const tag = match[0];
      if (/rtl:rotate-180/.test(tag)) return false;
      return !mirroringIdentifiers.some((name) => tag.includes(name));
    });
  });
  check('every directional chevron mirrors in RTL', unmirrored.length === 0, unmirrored);

  /* ---------------------------------------------------------------------- */
  section('Fallback chain renders, never blanks');

  const [target] = await sql<{ id: string; slug: string; title: Record<string, string | null> }[]>`
    select id, slug, title from products
    where status = 'published' and title->>'en' is not null limit 1
  `;
  const original = target.title;
  const faTitle = original.fa as string;

  // postgres.js needs jsonb as a cast STRING; passing the object throws inside bind.
  await sql`
    update products set title = ${JSON.stringify({ ...original, en: null })}::jsonb
    where id = ${target.id}
  `;

  const enDetail = await html(`/en/products/${encodeURIComponent(target.slug)}`);
  check('an English page with no English title shows the Dari one', enDetail.includes(faTitle));
  check('with no MISSING_MESSAGE marker anywhere', !enDetail.includes('MISSING_MESSAGE'));
  check('and a non-empty <title>', /<title>[^<]{3,}<\/title>/.test(enDetail));

  const enListing = await html('/en/products');
  check(
    'the listing card falls back too, rather than rendering blank',
    !enListing.includes(`/products/${target.slug}`) || enListing.includes(faTitle),
  );

  await sql`update products set title = ${JSON.stringify(original)}::jsonb where id = ${target.id}`;
  const [restored] = await sql<{ en: string | null }[]>`
    select title->>'en' as en from products where id = ${target.id}
  `;
  check('the title is restored', restored.en === original.en);

  /* ---------------------------------------------------------------------- */
  section('Images go through the sharp variants');

  const images = await sql<{ path: string }[]>`select path from product_images limit 40`;
  const missingVariants = images.filter(
    (image) =>
      !existsSync(join('public', image.path.replace('.webp', '-800.webp'))) ||
      !existsSync(join('public', image.path.replace('.webp', '-240.webp'))),
  );
  check(
    'every product image has its 800w and 240w variants on disk',
    missingVariants.length === 0,
    missingVariants.slice(0, 3).map((image) => image.path),
  );

  const home = await html('/fa');
  check(
    'the home page serves images through the Next optimiser, not raw paths',
    home.includes('/_next/image?url=') || home.includes('srcSet'),
  );
  check('and declares no raw <img> tags', !/<img\s(?![^>]*data-nimg)/.test(home));

  /* ---------------------------------------------------------------------- */
  section('Locale-aware relative timestamps');

  const { formatRelative } = await import('../lib/format');
  const anHourAgo = new Date(Date.now() - 3600_000);
  const faRelative = formatRelative(anHourAgo, 'fa');
  const enRelative = formatRelative(anHourAgo, 'en');
  check(
    'relative time is localised, not one language for both',
    faRelative !== enRelative && /[۰-۹]/.test(faRelative),
    { fa: faRelative, en: enRelative },
  );

  /* ---------------------------------------------------------------------- */
  section('Every surface still answers after the sweep');

  const admin = signIn('0700000001');
  const shopkeeper = signIn('0700000002');
  const customer = signIn('0700000003');

  const routes: Array<[string, string | undefined]> = [
    ['/fa', undefined],
    ['/fa/products', undefined],
    ['/fa/shops', undefined],
    ['/fa/categories', undefined],
    ['/fa/cart', customer],
    ['/fa/dashboard', shopkeeper],
    ['/fa/dashboard/products', shopkeeper],
    ['/fa/dashboard/orders', shopkeeper],
    ['/fa/dashboard/settings', shopkeeper],
    ['/fa/admin', admin],
    ['/fa/admin/revenue', admin],
    ['/fa/admin/categories', admin],
    ['/en', undefined],
    ['/en/admin/revenue', admin],
  ];
  for (const [path, cookie] of routes) {
    check(`${path} → 200`, (await status(path, cookie)) === 200);
  }

  const failed = summary();
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
