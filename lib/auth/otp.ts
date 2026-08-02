import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '../db';
import { otpCodes, users, type DbLocale, type User } from '../db/schema';
import { notify } from '../notify';
import { checkRateLimit } from './rate-limit';

/**
 * Phone + OTP sign-in (PRD §5.7, §12.2).
 *
 * In the demo build the code is never sent anywhere — it is written as a
 * notification row, so it surfaces in the on-screen log panel. That is the
 * moment the client watches during checkout: the OTP appears on screen as the
 * customer requests it (PRD §9.2).
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Afghan mobile numbers: 07 followed by 8 digits. */
export const PHONE_PATTERN = /^07\d{8}$/;

export function normalizePhone(input: string): string {
  // Tolerate Persian digits and separators from a Dari keyboard.
  const ascii = input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s\-()]/g, '');

  // Accept +93 / 0093 / 93 prefixes and reduce them to the local 0-prefixed form.
  return ascii.replace(/^\+?0{0,2}93/, '0').replace(/^([1-9])/, '0$1');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export type RequestOtpResult =
  | { ok: true; expiresAt: Date; phone: string }
  | { ok: false; error: 'invalid_phone' | 'too_many_requests' };

/**
 * Code requests per phone, and per phone per hour.
 *
 * Unlimited requests are three problems at once, and only the third is visible
 * today: every request supersedes the previous code, so a loop against someone
 * else's number locks that person out of signing in; every request writes a
 * notification row; and the day `notify()` is pointed at a real SMS gateway
 * instead of the in-app log, every request costs money.
 *
 * Generous enough that a customer who mistypes their number, retries, and asks
 * for a resend twice never meets it.
 */
const OTP_MAX_PER_WINDOW = 5;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_PER_HOUR = 10;
const OTP_HOUR_MS = 60 * 60 * 1000;

/**
 * Issues a code for a phone number and writes it to the notification log.
 *
 * Deliberately does NOT reveal whether the number already has an account:
 * verifyOtp creates the user on first successful sign-in, so the request step
 * behaves identically for new and returning customers.
 */
export async function requestOtp(rawPhone: string): Promise<RequestOtpResult> {
  const phone = normalizePhone(rawPhone);
  if (!PHONE_PATTERN.test(phone)) return { ok: false, error: 'invalid_phone' };

  /*
   * Checked AFTER the phone is validated and normalized, so the bucket key is
   * the same string regardless of how the caller spelled the number, and
   * garbage input cannot fill the map with keys.
   */
  if (
    !checkRateLimit(`otp:req:${phone}`, OTP_MAX_PER_WINDOW, OTP_WINDOW_MS) ||
    !checkRateLimit(`otp:req:hour:${phone}`, OTP_MAX_PER_HOUR, OTP_HOUR_MS)
  ) {
    return { ok: false, error: 'too_many_requests' };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Supersede any outstanding codes so only the newest one can be used.
  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)));

  await db.insert(otpCodes).values({ phone, codeHash: hashCode(code), expiresAt });

  const existing = await findUserByPhone(phone);

  await notify({
    eventKey: 'otp',
    channel: 'sms',
    recipientUserId: existing?.id ?? null,
    recipientRole: existing?.role ?? 'customer',
    locale: (existing?.locale ?? 'fa') as DbLocale,
    values: { code, phone },
  });

  return { ok: true, expiresAt, phone };
}

export type VerifyOtpResult =
  | { ok: true; user: User; isNewUser: boolean }
  | {
      ok: false;
      error: 'invalid_phone' | 'no_code' | 'expired' | 'too_many_attempts' | 'mismatch';
    };

/**
 * Verifies a code and returns the signed-in user, creating one on first use.
 */
export async function verifyOtp(
  rawPhone: string,
  code: string,
  options: { name?: string } = {},
): Promise<VerifyOtpResult> {
  const phone = normalizePhone(rawPhone);
  if (!PHONE_PATTERN.test(phone)) return { ok: false, error: 'invalid_phone' };

  const [record] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!record) return { ok: false, error: 'no_code' };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, error: 'expired' };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' };

  if (!safeEqualHex(record.codeHash, hashCode(code.trim()))) {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, record.id));
    return { ok: false, error: 'mismatch' };
  }

  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, record.id));

  const existing = await findUserByPhone(phone);
  if (existing) {
    if (!existing.active) return { ok: false, error: 'mismatch' };
    return { ok: true, user: existing, isNewUser: false };
  }

  const [created] = await db
    .insert(users)
    .values({
      phone,
      name: options.name?.trim() || phone,
      role: 'customer',
      locale: 'fa',
    })
    .returning();

  return { ok: true, user: created, isNewUser: true };
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.phone, normalizePhone(phone)))
    .limit(1);
  return row ?? null;
}

/**
 * Housekeeping for long demo sessions. Not scheduled — there is no background
 * worker by design (PRD §12.3); db:reset clears everything anyway.
 */
export async function purgeExpiredOtps(): Promise<number> {
  const rows = await db
    .delete(otpCodes)
    .where(and(gt(sql`now()`, otpCodes.expiresAt), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  return rows.length;
}
