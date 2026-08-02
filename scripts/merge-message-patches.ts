import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Merges messages/patches/*.json into messages/fa.json and messages/en.json.
 *
 * Several workstreams add translation keys at once, and a shared JSON file is
 * the one thing they cannot edit concurrently without clobbering each other.
 * Each writes a patch of the shape { "fa": {...}, "en": {...} } instead, and
 * this folds them in — deep-merging objects, refusing to overwrite an existing
 * leaf, and refusing the string-vs-namespace collision that CLAUDE.md records
 * being bitten by twice.
 */

type Tree = { [key: string]: string | Tree };

function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge(target: Tree, patch: Tree, trail: string[], source: string, notes: string[]): void {
  for (const [key, value] of Object.entries(patch)) {
    const here = [...trail, key];
    const existing = target[key];

    if (isTree(value)) {
      if (existing === undefined) {
        target[key] = {};
      } else if (typeof existing === 'string') {
        // The exact failure CLAUDE.md names: a key that is both a label and a
        // namespace. The object silently wins and t() renders the raw path.
        throw new Error(
          `${source}: "${here.join('.')}" is already a string but the patch adds keys under it`,
        );
      }
      merge(target[key] as Tree, value, here, source, notes);
      continue;
    }

    if (isTree(existing)) {
      throw new Error(
        `${source}: "${here.join('.')}" is already a namespace but the patch sets it to a string`,
      );
    }
    if (typeof existing === 'string') {
      if (existing !== value) notes.push(`kept existing ${here.join('.')} (${source} differed)`);
      continue;
    }
    target[key] = value;
  }
}

/*
 * Deliberately NOT sorted on the way out. The existing files are in editorial
 * order, not alphabetical, and re-sorting them would bury a handful of real new
 * keys under a three-thousand-line diff. New keys land where the merge put
 * them: appended within their namespace.
 */

async function main() {
  const root = process.cwd();
  const patchDir = path.join(root, 'messages/patches');

  let files: string[] = [];
  try {
    files = (await readdir(patchDir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    console.log('no messages/patches directory — nothing to merge');
    return;
  }
  if (files.length === 0) {
    console.log('no patches to merge');
    return;
  }

  const locales = ['fa', 'en'] as const;
  const trees: Record<string, Tree> = {};
  for (const locale of locales) {
    trees[locale] = JSON.parse(await readFile(path.join(root, `messages/${locale}.json`), 'utf8'));
  }

  const notes: string[] = [];
  for (const file of files) {
    const patch = JSON.parse(await readFile(path.join(patchDir, file), 'utf8')) as Record<
      string,
      Tree
    >;
    for (const locale of locales) {
      if (patch[locale]) merge(trees[locale], patch[locale], [], file, notes);
    }
    console.log(`merged ${file}`);
  }

  for (const locale of locales) {
    await writeFile(
      path.join(root, `messages/${locale}.json`),
      `${JSON.stringify(trees[locale], null, 2)}\n`,
      'utf8',
    );
  }

  for (const note of notes) console.log(`  · ${note}`);
  console.log(`✓ merged ${files.length} patch file(s) into fa.json and en.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
