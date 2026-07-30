import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import { users } from '../db/schema';
import { checkRateLimit } from './rate-limit';

/**
 * Password credential for the second sign-in mode (Prompt A1).
 *
 * The phone number is still the account (see the comment on `users` in
 * lib/db/schema/users.ts) — this module only adds a faster way in for an
 * account that already exists. Nothing here can create one.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Not exhaustive — a tiny deny-list, not a breach-corpus lookup service. The
 * point is to stop the handful of passwords someone would type without
 * thinking ("password", the site's own name), not to replace real password
 * strength meters a production build would add.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  'qwertyui',
  'gulbahar',
  'gulbahar1',
  'letmein1',
  'iloveyou',
  '11111111',
]);

export function isPasswordAllowed(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) return false;
  return !COMMON_PASSWORDS.has(password.toLowerCase());
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/**
 * A hash of a password nobody typed, computed once at import time. Verifying
 * against it costs the same argon2 work as a real check, so the credentials
 * provider can run a verify() call for a phone/email that does not exist and
 * take the same wall-clock time as a wrong password for one that does —
 * otherwise "no such account" replies fast and "wrong password" replies slow,
 * and the gap IS the enumeration oracle the uniform error message exists to
 * close.
 */
const DUMMY_HASH_PROMISE = hash('this-value-is-never-a-real-password');

export async function verifyPassword(passwordHash: string | null, password: string): Promise<boolean> {
  if (!passwordHash) {
    await verify(await DUMMY_HASH_PROMISE, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}

/**
 * Sets or changes a password on an EXISTING account. Never creates one — the
 * caller has already established which signed-in user this is.
 */
export async function setUserPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash, passwordUpdatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Attempts per email per 15 minutes, ahead of any argon2 verify. */
export function passwordAttemptAllowed(email: string): boolean {
  return checkRateLimit(`password:${email.toLowerCase()}`, 10, 15 * 60 * 1000);
}
