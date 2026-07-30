/**
 * A fixed-window rate limiter, per key (Prompt A1).
 *
 * In-memory and per-process — the demo runs a single `next dev`/`next start`
 * process with no shared cache (CLAUDE.md: no Redis), so a Map is enough to
 * stop a brute-force loop from hammering the OTP or password path during the
 * demo itself. A REAL deployment with more than one process needs a shared
 * store (Redis, or the database) instead, or two instances each grant their
 * own quota and the limit is a lie.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Returns true when `key` is still under `max` attempts within `windowMs`,
 * and counts this call toward that total. The window resets on its own once
 * it lapses rather than needing a cleanup pass — a slightly stale bucket for
 * a key nobody has hit in a while costs nothing.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= max;
}
