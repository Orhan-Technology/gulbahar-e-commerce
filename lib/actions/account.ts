'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requestEmailVerification, verifyEmailCode } from '../auth/email';
import { currentUser } from '../auth/guards';
import { normalizePhone, PHONE_PATTERN, requestOtp, verifyOtp } from '../auth/otp';
import { isPasswordAllowed, setUserPassword, verifyPassword } from '../auth/password';
import { addToCart } from '../cart';
import { db } from '../db';
import { addresses, orderItems, orders, products, users, type DbLocale } from '../db/schema';

/**
 * Account mutations (PRD §5.4): profile, saved addresses, reorder.
 *
 * Every write is scoped by the session user id in the WHERE clause, not just
 * checked beforehand — so a forged address id cannot touch someone else's row.
 */

export type AccountResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  district: z.string().trim().min(1).max(60),
  streetDetails: z.string().trim().min(1).max(200),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((value) => PHONE_PATTERN.test(value), { message: 'invalid_phone' }),
});

export async function saveAddress(input: {
  id?: string;
  label: string;
  district: string;
  streetDetails: string;
  phone: string;
}): Promise<AccountResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }

  if (input.id) {
    await db
      .update(addresses)
      .set(parsed.data)
      // userId in the predicate is the authorisation check.
      .where(and(eq(addresses.id, input.id), eq(addresses.userId, user.id)));
  } else {
    await db.insert(addresses).values({ ...parsed.data, userId: user.id });
  }

  revalidatePath('/account');
  revalidatePath('/checkout');
  return { ok: true };
}

export async function deleteAddress(id: string): Promise<AccountResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  /*
   * orders.address_id is ON DELETE SET NULL, so removing an address does not
   * delete order history — the order keeps its snapshot of where it went via the
   * events chain, and the row simply loses its link.
   */
  await db
    .delete(addresses)
    .where(and(eq(addresses.id, parsed.data), eq(addresses.userId, user.id)));

  revalidatePath('/account');
  return { ok: true };
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  locale: z.enum(['fa', 'en', 'ps']),
});

export async function updateProfile(input: {
  name: string;
  locale: string;
}): Promise<AccountResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  await db.update(users).set(parsed.data).where(eq(users.id, user.id));

  revalidatePath('/account');
  return { ok: true };
}

/**
 * Reorder: puts every still-available line from a past order back in the cart
 * (PRD §5.4).
 *
 * Skips anything unpublished or out of stock rather than failing the whole
 * action, and reports how many lines were skipped so the UI can say so honestly.
 */
export async function reorder(
  reference: string,
): Promise<AccountResult<{ added: number; skipped: number }>> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.reference, reference), eq(orders.userId, user.id)))
    .limit(1);

  if (!order) return { ok: false, error: 'not_found' };

  const lines = await db
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      variantSelection: orderItems.variantSelection,
      status: products.status,
      stock: products.stock,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id));

  let added = 0;
  let skipped = 0;

  for (const line of lines) {
    if (!line.productId || line.status !== 'published' || (line.stock ?? 0) <= 0) {
      skipped += 1;
      continue;
    }
    await addToCart(
      line.productId,
      Math.min(line.quantity, line.stock ?? line.quantity),
      line.variantSelection ?? null,
    );
    added += 1;
  }

  revalidatePath('/cart');
  return { ok: true, data: { added, skipped } };
}

/*
 * Security: email verification and password (Prompt A1).
 *
 * Every action here re-derives the signed-in user from the session rather
 * than trusting a userId the client might pass — there is no legitimate
 * reason for these forms to ever name a different account.
 */

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function requestEmailVerificationAction(email: string): Promise<AccountResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: 'invalid_email' };

  const result = await requestEmailVerification(
    user.id,
    parsed.data.email,
    (user.locale ?? 'fa') as DbLocale,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/account');
  return { ok: true };
}

const emailCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, { message: 'invalid_code' }) });

export async function verifyEmailCodeAction(code: string): Promise<AccountResult<{ email: string }>> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = emailCodeSchema.safeParse({ code });
  if (!parsed.success) return { ok: false, error: 'invalid_code' };

  const result = await verifyEmailCode(user.id, parsed.data.code);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/account');
  return { ok: true, data: { email: result.email } };
}

const setPasswordSchema = z
  .object({
    newPassword: z.string().min(8, { message: 'weak_password' }),
    confirmPassword: z.string(),
    currentPassword: z.string().optional(),
    otpCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'password_mismatch',
    path: ['confirmPassword'],
  });

/**
 * Sets a password for the first time, or changes an existing one.
 *
 * The two are the same action with a branch, not two actions: whether
 * re-authentication is required depends entirely on whether the account
 * already has a `passwordHash`, which only the server can check. A first-time
 * set needs nothing beyond the existing session (PRD's "Set a password" —
 * being signed in already proved who this is); a CHANGE requires the current
 * password or, for someone who has forgotten it, a fresh OTP to the account
 * phone — never the new password alone, or a hijacked session could lock the
 * real owner out by rotating a credential they never typed.
 */
export async function setPasswordAction(
  input: z.input<typeof setPasswordSchema>,
): Promise<AccountResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }

  if (!isPasswordAllowed(parsed.data.newPassword)) {
    return { ok: false, error: 'weak_password' };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash, phone: users.phone })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (row?.passwordHash) {
    const viaCurrentPassword =
      parsed.data.currentPassword &&
      (await verifyPassword(row.passwordHash, parsed.data.currentPassword));

    const viaOtp =
      !viaCurrentPassword &&
      parsed.data.otpCode &&
      (await verifyOtp(row.phone, parsed.data.otpCode)).ok;

    if (!viaCurrentPassword && !viaOtp) return { ok: false, error: 'reauth_required' };
  }

  await setUserPassword(user.id, parsed.data.newPassword);

  revalidatePath('/account');
  return { ok: true };
}

/** Sends an OTP to the SIGNED-IN user's own phone — never a client-supplied one. */
export async function requestPasswordChangeOtpAction(): Promise<AccountResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const result = await requestOtp(user.phone);
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true };
}
