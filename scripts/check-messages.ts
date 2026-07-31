/**
 * Static audit of translation usage.
 *
 * Three failures this catches, all of which render as visible garbage rather than
 * throwing, and none of which typecheck or lint will notice:
 *
 *   1. A literal `t('key')` with no matching message → next-intl returns the key
 *      PATH as the string, so the UI shows "shopOrders.title".
 *   2. A key that resolves to an OBJECT because the same name is used for a label
 *      and for a namespace. The object wins, silently. Bitten twice
 *      (checkout.hesabpay, shopProducts.import) — hence this script.
 *   3. fa/en drift: a key present in one locale and missing in the other.
 *
 * Dynamic keys (`t(`errors.${code}`)`) cannot be resolved statically; the prefix is
 * checked instead, so a missing namespace is still caught.
 *
 * Run: npm run check:messages
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import enMessages from '../messages/en.json';
import faMessages from '../messages/fa.json';

type Tree = Record<string, unknown>;

const LOCALES: Record<string, Tree> = { fa: faMessages, en: enMessages };

function resolve(tree: Tree, dotted: string): unknown {
  let cursor: unknown = tree;
  for (const part of dotted.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(part in cursor)) return undefined;
    cursor = (cursor as Tree)[part];
  }
  return cursor;
}

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatten(value as Tree, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const problems: string[] = [];

/**
 * Comments are stripped before anything is matched.
 *
 * The house rule, learned the hard way by `npm run audit` (CLAUDE.md): a static
 * auditor that reads its own explanatory prose reports it. A comment that
 * mentions `t('x')` while explaining a cast is not a call, and reporting it
 * sends the reader looking for a key that was never used.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/* 1 + 2 — every literal t('…') call resolves to a string in fa */
for (const file of [...sourceFiles('app'), ...sourceFiles('components')]) {
  const source = stripComments(readFileSync(file, 'utf8'));

  const namespaces = [
    ...new Set(
      [...source.matchAll(/(?:useTranslations|getTranslations)\('([^']+)'\)/g)].map((m) => m[1]),
    ),
  ];
  if (namespaces.length === 0) continue;

  // Literal keys.
  for (const match of new Set([...source.matchAll(/\bt\(\s*'([^'${]+)'/g)].map((m) => m[1]))) {
    const resolved = namespaces
      .map((namespace) => resolve(faMessages, `${namespace}.${match}`))
      .filter((value) => value !== undefined);

    if (resolved.length === 0) {
      problems.push(`${file}: t('${match}') — no such key under ${namespaces.join(' | ')}`);
    } else if (resolved.every((value) => typeof value === 'object')) {
      problems.push(
        `${file}: t('${match}') resolves to a NAMESPACE, not a string — it will render the raw key path`,
      );
    }
  }

  // Template keys: check the static prefix exists as a namespace.
  for (const match of new Set(
    [...source.matchAll(/\bt\(\s*`([^`$]+)\$\{/g)].map((m) => m[1].replace(/\.$/, '')),
  )) {
    if (!match) continue;
    const found = namespaces.some((namespace) => {
      const value = resolve(faMessages, `${namespace}.${match}`);
      return typeof value === 'object' && value !== null;
    });
    if (!found) {
      problems.push(
        `${file}: t(\`${match}.\${…}\`) — "${match}" is not a namespace under ${namespaces.join(' | ')}`,
      );
    }
  }
}

/*
 * 3 — no literal dot inside a key name.
 *
 * next-intl uses "." to express nesting, so a key written as
 * `"shop.approve": "…"` is not a key called shop.approve — it throws
 * INVALID_KEY the moment the tree is loaded, and the page 500s at render with
 * a message that names the character rather than the file. Caught here because
 * the natural way to write it is exactly the way that breaks: the audit log's
 * action codes ARE dotted, and mirroring them one-for-one into messages looks
 * obviously right (Prompt C9).
 */
function dottedKeys(tree: Tree, prefix = ''): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    if (key.includes('.')) found.push(`${prefix}${key}`);
    if (value && typeof value === 'object') {
      found.push(...dottedKeys(value as Tree, `${prefix}${key}.`));
    }
  }
  return found;
}

for (const [locale, tree] of Object.entries(LOCALES)) {
  for (const key of dottedKeys(tree as Tree)) {
    problems.push(
      `messages/${locale}.json: "${key}" contains a dot — next-intl reads that as nesting and throws INVALID_KEY`,
    );
  }
}

/* 4 — fa/en parity */
const faKeys = new Set(flatten(LOCALES.fa));
const enKeys = new Set(flatten(LOCALES.en));
for (const key of faKeys) if (!enKeys.has(key)) problems.push(`messages/en.json: missing ${key}`);
for (const key of enKeys) if (!faKeys.has(key)) problems.push(`messages/fa.json: missing ${key}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} message problem(s):\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`✅ messages clean — ${faKeys.size} keys, fa/en in parity`);
