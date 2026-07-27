'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { normalizePhone, PHONE_PATTERN } from '../auth/otp';
import { addToCart } from '../cart';
import { db } from '../db';
import { addresses, orderItems, orders, products, users } from '../db/schema';

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
