'use server';

import { AuthError } from 'next-auth';
import { z } from 'zod';

import { signIn, signOut } from '../auth';
import { mergeGuestCart } from '../cart';
import { findUserByEmail } from '../auth/email';
import { findUserByPhone } from '../auth/otp';
import { normalizePhone, PHONE_PATTERN, requestOtp } from '../auth/otp';

/**
 * Server actions for phone + OTP sign-in (PRD §5.7).
 *
 * Zod-validates every input at the boundary (CLAUDE.md). Error results are
 * returned as stable string codes rather than prose, so the UI can translate them
 * — an English error string would break the Dari-first rule as visibly as an
 * untranslated label.
 */

const phoneSchema = z.object({
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((value) => PHONE_PATTERN.test(value), { message: 'invalid_phone' }),
});

const verifySchema = phoneSchema.extend({
  code: z.string().regex(/^\d{6}$/, { message: 'invalid_code' }),
  name: z.string().trim().max(80).optional(),
});

export type ActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

/**
 * What the CODE STEP needs to know as soon as a code exists.
 *
 * `lifetimeMinutes` so the form can state how long the code lasts under the
 * field, instead of the customer learning it from an "expired" toast after
 * typing it; `hasName` so a returning customer is not asked their name again.
 */
export type OtpRequested = { lifetimeMinutes: number; hasName: boolean };

/** Issues a code. It arrives in the on-screen notification log (PRD §9.2). */
export async function requestOtpAction(formData: FormData): Promise<ActionResult<OtpRequested>> {
  const parsed = phoneSchema.safeParse({ phone: formData.get('phone') });
  if (!parsed.success) {
    return { ok: false, error: 'invalid_phone' };
  }

  const result = await requestOtp(parsed.data.phone);
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    data: {
      // Rounded UP: "5 minutes" is the promise, and a code that dies at 4:59
      // when the screen said 4 would be the one failure this line exists to
      // prevent. Derived from the issued row rather than from a duplicated
      // constant, so the sentence cannot drift from the TTL.
      lifetimeMinutes: Math.max(1, Math.ceil((result.expiresAt.getTime() - Date.now()) / 60_000)),
      hasName: result.hasName,
    },
  };
}

/** Verifies the code and establishes the session. */
export async function verifyOtpAction(
  formData: FormData,
): Promise<ActionResult<{ role: string }>> {
  const parsed = verifySchema.safeParse({
    phone: formData.get('phone'),
    code: formData.get('code'),
    name: formData.get('name') ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_code' };
  }

  try {
    await signIn('otp', {
      phone: parsed.data.phone,
      code: parsed.data.code,
      name: parsed.data.name ?? '',
      redirect: false,
    });

    /*
     * Fold the guest's cookie cart into their account (PRD §5.3).
     *
     * Runs after signIn so the user row definitely exists — a first-time customer
     * is created during verification. Without this, being asked to verify a phone
     * number at checkout would silently empty the basket, which is the single most
     * damaging thing that could happen during the demo's checkout walkthrough.
     */
    const signedIn = await findUserByPhone(parsed.data.phone);
    if (signedIn) await mergeGuestCart(signedIn.id);

    // The role travels back so the form can land each role on its own surface:
    // admin → /admin, shopkeeper → /dashboard, customer → wherever they were.
    return { ok: true, data: { role: signedIn?.role ?? 'customer' } };
  } catch (error) {
    if (error instanceof AuthError) {
      // verifyOtp already distinguished the reason; the provider can only signal
      // pass/fail, so the UI shows a single "code not accepted" message.
      return { ok: false, error: 'code_rejected' };
    }
    throw error;
  }
}

const emailSignInSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: 'invalid_credentials' }),
  password: z.string().min(1, { message: 'invalid_credentials' }),
});

/**
 * Email + password sign-in (Prompt A1). Returns the SAME uniform error code
 * whatever went wrong — the 'email' provider already collapses every reason
 * (no such email, unverified, no password, wrong password) into one refusal,
 * so there is nothing more specific to report here without undoing that.
 */
export async function signInWithEmailAction(
  formData: FormData,
): Promise<ActionResult<{ role: string }>> {
  const parsed = emailSignInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { ok: false, error: 'invalid_credentials' };

  try {
    await signIn('email', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });

    const signedIn = await findUserByEmail(parsed.data.email);
    if (signedIn) await mergeGuestCart(signedIn.id);

    return { ok: true, data: { role: signedIn?.role ?? 'customer' } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: 'invalid_credentials' };
    }
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirect: false });
}
