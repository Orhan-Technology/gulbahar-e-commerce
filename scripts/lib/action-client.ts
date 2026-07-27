/**
 * Drives real server actions over HTTP with a real session cookie.
 *
 * Shared by every check:phaseN script, because re-implementing an action in a test
 * checks the test, not the shipped authorization and validation. Three things make
 * this work and none of them are obvious:
 *
 *   1. Action ids live in `.next/dev/server/app/**\/server-reference-manifest.json`
 *      and are PER PAGE — an action is only callable from a page whose manifest
 *      lists it. So the pages must be requested first, to compile them.
 *   2. The return value comes back as a `<row>:{…}` line inside the flight stream,
 *      alongside the re-rendered page.
 *   3. For a multipart call (any argument carrying a File), the FILE PARTS MUST BE
 *      APPENDED BEFORE the root argument part "0". React resolves the root model
 *      the moment busboy emits it, so a `$K` FormData reference can only see parts
 *      that already arrived — root-first yields a silently EMPTY FormData.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = process.env.BASE_URL ?? 'http://localhost:3005';

/**
 * Signs in through scripts/login.sh and returns a Cookie header value.
 *
 * The session cookie is HttpOnly, which curl writes as a "#HttpOnly_" line — a jar
 * parser that skips every '#' line drops exactly the cookie that matters, and every
 * authenticated call then comes back "forbidden" for no visible reason.
 */
export function signIn(phone: string): string {
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

export type ActionRef = { id: string; page: string };

/** Reads the manifest so the checks survive any edit that rehashes an action. */
export function loadActionIds(): Map<string, ActionRef> {
  const root = '.next/dev/server/app';
  const found = new Map<string, ActionRef>();

  if (!existsSync(root)) {
    /*
     * A production build writes its manifests elsewhere, so the action-driving suites
     * only run against `npm run dev`. Saying so here saves the next person working
     * out why a green production smoke test cannot run check:phase6.
     */
    throw new Error(
      `${root} is missing.\n` +
        'The action-driving checks read the DEV server-reference manifest, so they need\n' +
        '`npm run dev` (not `npm run start`). Start it, load a page, and re-run.',
    );
  }

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'server-reference-manifest.json') {
        const manifest = JSON.parse(readFileSync(path, 'utf8')).node ?? {};
        // ".next/dev/server/app/[locale]/(admin)/admin/shops/page" → "/fa/admin/shops"
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

  walk(root);
  return found;
}

/*
 * Action results are shaped per action and the checks read them positionally, so
 * one loose alias beats a dozen narrow ones in a dev-only script.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionResult = any;

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

export class ActionClient {
  private actions: Map<string, ActionRef>;

  private constructor(actions: Map<string, ActionRef>) {
    this.actions = actions;
  }

  /**
   * Requests every page first so its actions exist in the manifest, then reads the
   * manifest once.
   */
  static async create(pages: string[], cookie?: string): Promise<ActionClient> {
    for (const page of pages) await html(page, cookie);
    return new ActionClient(loadActionIds());
  }

  async call(cookie: string, name: string, args: unknown[]): Promise<ActionResult> {
    const action = this.actions.get(name);
    if (!action) throw new Error(`no action id for ${name} — load its page first`);

    const response = await fetch(`${BASE}${action.page}`, {
      method: 'POST',
      headers: { cookie, 'Next-Action': action.id, 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(args),
    });
    return resultFrom(await response.text());
  }

  /** Multipart variant; file parts go first — see the header comment. */
  async callWithFiles(
    cookie: string,
    name: string,
    leadingArgs: unknown[],
    files: Array<{ field: string; filename: string; type: string; bytes: Buffer }>,
  ): Promise<ActionResult> {
    const action = this.actions.get(name);
    if (!action) throw new Error(`no action id for ${name}`);

    const partId = leadingArgs.length + 1;
    const body = new FormData();
    for (const file of files) {
      body.append(
        `_${partId}_${file.field}`,
        new Blob([new Uint8Array(file.bytes)], { type: file.type }),
        file.filename,
      );
    }
    body.append('0', JSON.stringify([...leadingArgs, `$K${partId.toString(16)}`]));

    const response = await fetch(`${BASE}${action.page}`, {
      method: 'POST',
      headers: { cookie, 'Next-Action': action.id },
      body,
    });
    return resultFrom(await response.text());
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }
}

export async function html(path: string, cookie?: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  return response.text();
}

export async function status(path: string, cookie?: string): Promise<number> {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  return response.status;
}

/* -------------------------------------------------------------------------- */

/** Minimal pass/fail reporter shared by the check scripts. */
export function createReporter() {
  let passed = 0;
  let failed = 0;

  return {
    check(label: string, ok: boolean, detail?: unknown) {
      if (ok) {
        passed += 1;
        console.log(`  ✓ ${label}`);
      } else {
        failed += 1;
        console.log(`  ✗ ${label}${detail === undefined ? '' : `  ← ${JSON.stringify(detail)}`}`);
      }
    },
    section(title: string) {
      console.log(`\n${title}`);
    },
    summary() {
      console.log(`\n${passed} passed, ${failed} failed`);
      return failed;
    },
  };
}
