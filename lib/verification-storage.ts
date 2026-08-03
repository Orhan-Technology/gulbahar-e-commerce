import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Where identity documents live (Prompt C7).
 *
 * OUTSIDE THE SERVED TREE, and that is the whole point of this module. Every
 * other image in this product goes through lib/images.ts into public/uploads,
 * where it becomes a URL. A business licence and a tazkira must not become a
 * URL: a URL is a thing that gets shared, indexed, cached by a CDN and pasted
 * into a chat. These files are read back only by lib/db/queries/verification.ts
 * through an authenticated route that checks who is asking.
 *
 * WHAT PRODUCTION STILL NEEDS, named rather than pretended:
 *   - Encryption at rest. These are plaintext files on a disk today.
 *   - A retention policy. Nothing deletes a document after a verification
 *     expires; a real deployment should, and probably after 90 days.
 *   - Access logging. Who opened which document and when is exactly the audit
 *     trail a mall with several staff will be asked for.
 *   - Virus scanning on upload, which any file a stranger sends deserves.
 * This is a demo that runs on one laptop (CLAUDE.md), so none of those are
 * built; saying so is better than a comment claiming the storage is secure.
 */

/** Everything lives under here, which is deliberately not `public/`. */
const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'verification');

/** Small enough to be a document, large enough for a phone photo of one. */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export function isAllowedDocumentMime(mime: string): boolean {
  return (ALLOWED_DOCUMENT_MIME as readonly string[]).includes(mime);
}

/**
 * Writes a document and returns its RELATIVE path.
 *
 * The stored name is a uuid plus a hash of the bytes, never the uploaded
 * filename: a filename carries a person's name often enough ("naderi-tazkira
 * .jpg"), and a predictable one makes guessing worthwhile even behind an auth
 * check.
 */
export async function storeVerificationDocument(
  shopId: string,
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const extension = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const name = `${randomUUID()}-${digest}.${extension}`;

  // One directory per shop, so a mistaken bulk delete has an obvious blast
  // radius and a retention job has something to iterate.
  const directory = path.join(STORAGE_ROOT, shopId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), bytes);

  return path.join(shopId, name);
}

/**
 * Reads a document back for the authenticated route.
 *
 * The relative path is re-joined and then CHECKED to still be inside the
 * storage root — a `../../.env` in the database column would otherwise be a
 * file read of anything the process can see. The column is only ever written by
 * the function above, but a path traversal guard that depends on "nothing else
 * writes here" is not a guard.
 */
export async function readVerificationDocument(relativePath: string): Promise<Buffer | null> {
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(STORAGE_ROOT) + path.sep)) return null;

  try {
    return await readFile(resolved);
  } catch {
    return null;
  }
}

/**
 * Can this document actually be opened?
 *
 * A ROW IS NOT A DOCUMENT. `shop_verification_documents` records that a file
 * was meant to exist; whether the bytes are still on disk is a separate fact,
 * and the two came apart badly — every seeded submission pointed at a path
 * nothing had ever written, so both review panes rendered the route's bare
 * «Not found» body inside an <embed> and an admin could approve an identity on
 * zero evidence without noticing.
 *
 * The reviewer's screen and the decision action both ask this BEFORE offering
 * approval, so "no evidence" is a state the UI names rather than a blank frame
 * the reader has to interpret. It deliberately does NOT read the bytes: a
 * `stat` answers the question at a fraction of the cost, and a queue page runs
 * this once per document per render.
 *
 * The same traversal guard as the reader above, for the same reason — a check
 * that trusts the column is not a check.
 */
export async function verificationDocumentExists(relativePath: string): Promise<boolean> {
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(STORAGE_ROOT) + path.sep)) return false;

  try {
    const info = await stat(resolved);
    // An empty file is a failed write, not a document. Treating it as present
    // would put a zero-byte PDF in front of a reviewer as if it were evidence.
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
