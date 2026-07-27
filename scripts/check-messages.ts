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

/* 1 + 2 — every literal t('…') call resolves to a string in fa */
for (const file of [...sourceFiles('app'), ...sourceFiles('components')]) {
  const source = readFileSync(file, 'utf8');

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

/* 3 — fa/en parity */
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
