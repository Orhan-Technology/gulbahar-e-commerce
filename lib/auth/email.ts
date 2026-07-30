import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '../db';
import { emailVerificationCodes, users, type DbLocale, type User } from '../db/schema';
import { notify } from '../notify';
import { checkRateLimit } from './rate-limit';

/**
 * Email as a SECOND credential, verified the same way a phone number is
 * (Prompt A1) — a 6-digit code, hashed at rest, delivered to the demo
 * notification log rather than a real inbox. Unlike the phone, email never
 * creates an account by itself: `requestEmailVerification` always takes an
 * existing signed-in user's id, and the code proves control of the address
 * FOR THAT ACCOUNT, not general possession of it.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause;
  return (error as { code?: string }).code === '23505' || cause?.code === '23505';
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export type RequestEmailVerificationResult =
  | { ok: true }
  | { ok: false; error: 'email_taken' | 'rate_limited' };

/**
 * Issues a code for an email address and attaches it to `userId` — the caller
 * (the server action) has already confirmed this is the signed-in user, so
 * there is no separate "does this account exist" check here the way the OTP
 * flow has one for phone.
 */
export async function requestEmailVerification(
  userId: string,
  rawEmail: string,
  locale: DbLocale,
): Promise<RequestEmailVerificationResult> {
  const email = normalizeEmail(rawEmail);

  if (!checkRateLimit(`email-verify:${userId}`, 5, 15 * 60 * 1000)) {
    return { ok: false, error: 'rate_limited' };
  }

  // A verified email already claimed by a DIFFERENT account is refused up
  // front — a nicer message than waiting for the unique-index violation that
  // would otherwise surface only once this code is entered.
  const existing = await findUserByEmail(email);
  if (existing && existing.id !== userId) return { ok: false, error: 'email_taken' };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Supersede any outstanding codes for this account so only the newest works.
  await db
    .update(emailVerificationCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailVerificationCodes.userId, userId), isNull(emailVerificationCodes.consumedAt)));

  await db
    .insert(emailVerificationCodes)
    .values({ userId, email, codeHash: hashCode(code), expiresAt });

  await notify({
    eventKey: 'email.verify',
    channel: 'sms',
    recipientUserId: userId,
    recipientRole: 'customer',
    locale,
    values: { code, email },
  });

  return { ok: true };
}

export type VerifyEmailCodeResult =
  | { ok: true; email: string }
  | { ok: false; error: 'no_code' | 'expired' | 'too_many_attempts' | 'mismatch' | 'email_taken' };

export async function verifyEmailCode(userId: string, code: string): Promise<VerifyEmailCodeResult> {
  const [record] = await db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(eq(emailVerificationCodes.userId, userId), isNull(emailVerificationCodes.consumedAt)),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);

  if (!record) return { ok: false, error: 'no_code' };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, error: 'expired' };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' };

  if (!safeEqualHex(record.codeHash, hashCode(code.trim()))) {
    await db
      .update(emailVerificationCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(emailVerificationCodes.id, record.id));
    return { ok: false, error: 'mismatch' };
  }

  await db
    .update(emailVerificationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(emailVerificationCodes.id, record.id));

  try {
    await db
      .update(users)
      .set({ email: record.email, emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    // Someone else claimed and verified the same address between this code
    // being issued and being entered — rare, but the unique index is the
    // source of truth, not the up-front check in requestEmailVerification.
    if (isUniqueViolation(error)) return { ok: false, error: 'email_taken' };
    throw error;
  }

  return { ok: true, email: record.email };
}
