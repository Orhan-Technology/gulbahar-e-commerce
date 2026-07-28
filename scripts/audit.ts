/**
 * Static audit for Phase 9 (PRD §10.3, §10.5, §10.6).
 *
 * Everything here is a rule that a human sweep would miss on the twentieth file:
 * a physical CSS property that breaks RTL, a hardcoded Dari string that never
 * reached messages/, an <Image> with no dimensions, an animation over its motion
 * budget, a route group with no error boundary.
 *
 * It reports rather than asserts by default so the output is a work list; pass
 * --strict to make it exit non-zero, which is what the check script does once the
 * list is empty.
 *
 * Run: npm run audit           (report)
 *      npm run audit -- --strict
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type Finding = { rule: string; file: string; line: number; detail: string };

const findings: Finding[] = [];
const strict = process.argv.includes('--strict');

function walk(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path, match);
    return match.test(entry) ? [path] : [];
  });
}

const sourceFiles = [...walk('app', /\.tsx?$/), ...walk('components', /\.tsx?$/)];
const appFiles = walk('app', /\.tsx$/);

/**
 * Per-line exemptions, read from the RAW source before comments are stripped.
 *
 * `// audit-allow <rule> — reason` on the line above suppresses that rule for the
 * next line, the same shape as an eslint-disable-next-line. Every audit needs this:
 * without it the only way to silence a justified exception is to weaken the rule for
 * everyone, and a reason written next to the code is worth more than a clever regex
 * in the auditor.
 */
const allowances = new Map<string, Set<number>>();

const allowedRules = new Map<string, Map<number, string>>();

function loadAllowances(file: string, source: string) {
  const lines = source.split('\n');
  const rules = new Map<number, string>();

  lines.forEach((line, index) => {
    const match = /audit-allow\s+([a-z-]+)/.exec(line);
    if (!match) return;
    /*
     * Applies to the next line that is not itself a comment, so a marker whose
     * reason wraps onto a second line still exempts the code beneath it — the
     * off-by-one that made a two-line justification silently do nothing.
     */
    let target = index + 1;
    while (target < lines.length && /^\s*(?:\/\/|\*|\/\*)/.test(lines[target])) target += 1;
    rules.set(target, match[1]);
  });

  allowedRules.set(file, rules);
  allowances.set(file, new Set(rules.keys()));
}

function isAllowed(file: string, index: number, rule: string): boolean {
  // Named per line, so one exemption cannot silence a different rule.
  return allowedRules.get(file)?.get(index) === rule;
}

function report(rule: string, file: string, index: number, detail: string) {
  if (isAllowed(file, index, rule)) return;
  findings.push({ rule, file: relative(process.cwd(), file), line: index + 1, detail });
}

/**
 * Strips comments before matching.
 *
 * Without this the auditor flags its own explanatory prose: a comment saying "grows
 * right-to-left in Dari" contains `right-` and `left-`, and twelve of the first
 * fourteen findings were exactly that. A rule that reports the documentation of the
 * thing it is checking for is noise, and noise is how a checklist gets ignored.
 */
function stripComments(source: string): string[] {
  const lines = source.split('\n');
  let inBlock = false;

  return lines.map((line) => {
    let out = line;
    if (inBlock) {
      const end = out.indexOf('*/');
      if (end === -1) return '';
      out = out.slice(end + 2);
      inBlock = false;
    }
    // Block comments opened on this line.
    for (;;) {
      const start = out.indexOf('/*');
      if (start === -1) break;
      const end = out.indexOf('*/', start + 2);
      if (end === -1) {
        out = out.slice(0, start);
        inBlock = true;
        break;
      }
      out = out.slice(0, start) + out.slice(end + 2);
    }
    // Line comments, including JSX `{/* … */}` remnants handled above.
    const line1 = out.indexOf('//');
    if (line1 !== -1 && !/https?:$/.test(out.slice(0, line1 + 1))) out = out.slice(0, line1);
    return out;
  });
}

for (const file of [...sourceFiles, ...walk('app', /\.css$/)]) {
  loadAllowances(file, readFileSync(file, 'utf8'));
}

/* -------------------------------------------------------------------------- */
/* 1. Physical CSS properties (PRD §10.3)                                     */

/*
 * Tailwind's physical utilities and their logical replacements. Matched on word
 * boundaries with the variant prefix allowed (`sm:ml-2`, `hover:border-l`), because
 * a naive substring search hits `border-l-2` inside `border-lg` and misses
 * `md:text-left` entirely.
 */
const PHYSICAL_UTILITIES: Array<[RegExp, string]> = [
  [/(?:^|["'\s:])(ml-)/, 'ms-'],
  [/(?:^|["'\s:])(mr-)/, 'me-'],
  [/(?:^|["'\s:])(pl-)/, 'ps-'],
  [/(?:^|["'\s:])(pr-)/, 'pe-'],
  [/(?:^|["'\s:])(left-)/, 'start-'],
  [/(?:^|["'\s:])(right-)/, 'end-'],
  [/(?:^|["'\s:])(text-left)\b/, 'text-start'],
  [/(?:^|["'\s:])(text-right)\b/, 'text-end'],
  [/(?:^|["'\s:])(border-l)(?![a-z])/, 'border-s'],
  [/(?:^|["'\s:])(border-r)(?![a-z])/, 'border-e'],
  [/(?:^|["'\s:])(rounded-l)(?![a-z])/, 'rounded-s'],
  [/(?:^|["'\s:])(rounded-r)(?![a-z])/, 'rounded-e'],
  [/(?:^|["'\s:])(divide-x)\b/, 'no logical equivalent — check manually'],
];

/** Physical CSS in a stylesheet, where Tailwind's logical utilities do not apply. */
const PHYSICAL_CSS = /\b(margin|padding|border)-(left|right)\b|\b(left|right)\s*:/;

for (const file of sourceFiles) {
  const lines = stripComments(readFileSync(file, 'utf8'));
  lines.forEach((line, index) => {
    /*
     * Deliberate exceptions:
     *  - `rtl:`-prefixed pairs, which are how a physical property is made
     *    direction-aware where no logical variant exists (gradients).
     *  - centering, where left/right are symmetric: `left-[50%]` with a −50%
     *    translate is direction-neutral, and there is no logical equivalent.
     *  - Recharts props, which take the words 'left'/'right' as VALUES, not CSS.
     */
    if (/rtl:|bg-linear-to/.test(line)) return;
    if (/left-\[50%\]|slide-(?:in|out)-(?:from|to)-left|translate-x-\[-50%\]/.test(line)) return;
    if (/orientation=|reversed=|'left'|"left"|'right'|"right"/.test(line)) return;

    for (const [pattern, replacement] of PHYSICAL_UTILITIES) {
      const match = pattern.exec(line);
      if (match) report('physical-utility', file, index, `${match[1]} → ${replacement}`);
    }
  });
}

for (const file of walk('app', /\.css$/)) {
  stripComments(readFileSync(file, 'utf8')).forEach((line, index) => {
    if (/logical|rtl|ltr|@media|--/.test(line)) return;
    if (PHYSICAL_CSS.test(line)) report('physical-css', file, index, line.trim().slice(0, 70));
  });
}

/* -------------------------------------------------------------------------- */
/* 2. Hardcoded user-facing strings (PRD §11)                                 */

/*
 * A JSX text node containing a letter, outside a translation call. Latin-only
 * fragments are skipped when they are plainly not prose — a slug, a class name, an
 * icon size — but any Arabic-script text in a component is a hardcoded Dari string
 * by definition, since every real one goes through t().
 */
const DARI_TEXT = /[؀-ۿ]{3,}/;

for (const file of sourceFiles) {
  // The styleguide is an internal reference page, not a customer surface; its
  // sample rows are deliberately literal so they show real typography.
  if (file.includes('styleguide')) continue;

  stripComments(readFileSync(file, 'utf8')).forEach((line, index) => {
    if (!DARI_TEXT.test(line)) return;
    // A locale label like `fa: 'دری'` is a language name, not UI prose.
    if (/LOCALE_LABEL|langFa/.test(line)) return;
    report('hardcoded-dari', file, index, line.trim().slice(0, 70));
  });
}

/* -------------------------------------------------------------------------- */
/* 2b. Nested <form> — invalid HTML that breaks hydration                      */

/*
 * A <form> inside a <form> is illegal: the browser drops the inner one, the client
 * tree stops matching the server tree, and React regenerates the subtree. It shipped
 * in the checkout, where an inline "add address" form sat inside the outer one.
 *
 * Counted per file by walking the JSX: any depth above one is the bug. Comments are
 * already stripped, so prose mentioning <form> does not count.
 */
for (const file of sourceFiles) {
  const source = stripComments(readFileSync(file, 'utf8')).join('\n');
  let depth = 0;
  let deepest = 0;
  let deepestLine = 0;

  for (const match of source.matchAll(/<(\/?)form\b/g)) {
    depth += match[1] ? -1 : 1;
    if (depth > deepest) {
      deepest = depth;
      deepestLine = source.slice(0, match.index).split('\n').length - 1;
    }
  }
  if (deepest > 1) {
    report('nested-form', file, deepestLine, `<form> nested ${deepest} deep — invalid HTML`);
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Route-group error boundaries and not-found (PRD §10.5)                   */

const GROUPS = ['(shop)', '(dashboard)', '(admin)', '(onboarding)'];
for (const group of GROUPS) {
  const dir = join('app', '[locale]', group);
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    report('missing-group', dir, 0, 'route group not found');
    continue;
  }
  if (!entries.includes('error.tsx')) {
    report('missing-error-boundary', dir, 0, 'no error.tsx for this route group');
  }
}
try {
  if (!readdirSync(join('app', '[locale]')).includes('not-found.tsx')) {
    report('missing-not-found', 'app/[locale]', 0, 'no not-found.tsx');
  }
} catch {
  /* handled above */
}

/* -------------------------------------------------------------------------- */
/* 4. Motion budget (PRD §10.6)                                                */

/*
 * TWO budgets, not one.
 *
 * FEEDBACK ≤ 300ms — anything answering a tap, toggle or focus. The user has
 * already acted and is waiting to be told it worked, so duration reads as lag.
 *
 * DECORATIVE ≤ 500ms — hover transforms, section reveals, carousel slides.
 * Nothing is waiting on these, and an unhurried hover is a large part of why
 * the reference design feels considered rather than twitchy.
 *
 * A line is decorative when it says so: it mentions hover/group-hover, a
 * reveal or carousel animation, or carries an explicit `motion-decorative`
 * marker comment. Everything else is held to the feedback budget, so the
 * looser limit has to be claimed deliberately and is visible in review.
 *
 * INDEFINITE animations are exempt from the ceiling and checked separately:
 * a 1.8s pulse is not "slow", it is a heartbeat, and the thing that matters
 * about it is that it stops under prefers-reduced-motion — which the base
 * layer in globals.css guarantees globally.
 */
const FEEDBACK_MS = 300;
const DECORATIVE_MS = 500;

const DECORATIVE = /hover|reveal|carousel|marquee|decorative|pulse|caret/;

/*
 * The marker is looked for in a small WINDOW around the duration, not on the
 * same line. A Tailwind class list built with cn() routinely spans four or
 * five lines, and the duration and the `group-hover:` that justifies it land
 * on different ones — which flagged the product card's pop-out as a slow
 * feedback transition when it is the clearest decorative animation we have.
 *
 * Two lines either side covers a class list without reaching into the next
 * statement, so the looser budget still has to be claimed by something
 * adjacent and visible.
 */
function motionBudget(lines: string[], index: number): number {
  const window = lines.slice(Math.max(0, index - 2), index + 3).join(' ');
  return DECORATIVE.test(window) ? DECORATIVE_MS : FEEDBACK_MS;
}

for (const file of [...sourceFiles, ...walk('app', /\.css$/)]) {
  const lines = stripComments(readFileSync(file, 'utf8'));
  lines.forEach((line, index) => {
    // An infinite animation has no end to be too far away.
    if (/\binfinite\b/.test(line)) return;
    const budget = motionBudget(lines, index);

    // Tailwind duration utilities.
    for (const match of line.matchAll(/duration-(\d+)/g)) {
      const ms = Number(match[1]);
      if (ms > budget) report('motion-too-slow', file, index, `duration-${ms} > ${budget}ms`);
    }
    /*
     * Raw CSS durations, e.g. `animation: x 450ms`.
     *
     * The `(?!-)` is load-bearing. `\b` matches between `s` and `-`, so
     * `hover:text-accent-600 ms-auto` — a colour token followed by the logical
     * margin utility we are required to use — parsed as "600 ms" and reported
     * a 600ms transition on a line whose only duration was duration-150.
     * Nothing that is genuinely a CSS time is followed by a hyphen.
     */
    for (const match of line.matchAll(/(\d+(?:\.\d+)?)\s*(m?s)\b(?!-)/g)) {
      const ms = match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]);
      if (ms > budget && /animation|transition|duration/.test(line)) {
        report(
          'motion-too-slow',
          file,
          index,
          `${match[0]} > ${budget}ms in ${line.trim().slice(0, 40)}`,
        );
      }
    }
  });
}

/* -------------------------------------------------------------------------- */
/* 5. Images: dimensions and sizes (PRD §10.7, zero CLS)                       */

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  // Each <Image …> element, including multi-line ones.
  for (const match of source.matchAll(/<Image\b[\s\S]*?\/>/g)) {
    const tag = match[0];
    const line = source.slice(0, match.index).split('\n').length - 1;
    const hasFill = /\bfill\b/.test(tag);
    const hasDims = /\bwidth=/.test(tag) && /\bheight=/.test(tag);
    if (!hasFill && !hasDims) {
      report('image-no-dimensions', file, line, 'neither fill nor width+height');
    }
    // `sizes` is what stops Next serving the largest variant to a thumbnail.
    if (hasFill && !/\bsizes=/.test(tag)) {
      report('image-no-sizes', file, line, 'fill without sizes');
    }
    if (!/\balt=/.test(tag)) {
      report('image-no-alt', file, line, 'no alt attribute');
    }
  }
  // A raw <img> bypasses the sharp variants entirely.
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (/<img\s/.test(line)) report('raw-img', file, index, line.trim().slice(0, 60));
    });
}

/* -------------------------------------------------------------------------- */
/* 6. Pages that fetch without a Suspense boundary (PRD §10.5)                 */

for (const file of appFiles) {
  if (!file.endsWith('page.tsx')) continue;
  const source = readFileSync(file, 'utf8');
  const fetches =
    /await\s+(?:shop|admin|product|platform|order|category|revenue|campaign|booking|top|sales|notification|user|slot|all)\w*\(/.test(
      source,
    );
  const hasSuspense = source.includes('<Suspense');
  const hasSkeleton = /Skeleton|skeleton/.test(source);
  /*
   * A sibling loading.tsx counts. A page whose whole body waits on one query has
   * nothing to stream, so an internal Suspense boundary would wrap everything and
   * achieve nothing — the route-level boundary is the correct tool there.
   */
  const dir = file.slice(0, file.lastIndexOf('/'));
  let hasLoadingFile = false;
  try {
    hasLoadingFile = readdirSync(dir).includes('loading.tsx');
  } catch {
    hasLoadingFile = false;
  }

  if (fetches && !hasSuspense && !hasSkeleton && !hasLoadingFile) {
    report(
      'page-no-loading-state',
      file,
      0,
      'fetches data with no Suspense, skeleton or loading.tsx',
    );
  }
}

/* -------------------------------------------------------------------------- */

const byRule = new Map<string, Finding[]>();
for (const finding of findings) {
  const list = byRule.get(finding.rule) ?? [];
  list.push(finding);
  byRule.set(finding.rule, list);
}

if (findings.length === 0) {
  console.log('✅ audit clean');
  process.exit(0);
}

console.log(`\n${findings.length} finding(s) across ${byRule.size} rule(s):\n`);
for (const [rule, list] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`── ${rule} (${list.length})`);
  for (const finding of list.slice(0, 40)) {
    console.log(`   ${finding.file}:${finding.line}  ${finding.detail}`);
  }
  if (list.length > 40) console.log(`   … and ${list.length - 40} more`);
  console.log('');
}

process.exit(strict ? 1 : 0);
