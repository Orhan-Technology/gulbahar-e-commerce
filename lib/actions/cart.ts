'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { addToCart, clearCart, removeFromCart, setCartQuantity } from '../cart';
import { db } from '../db';
import { products, shops } from '../db/schema';

/**
 * Cart mutations (PRD §5.3). Work for guests and signed-in customers alike —
 * lib/cart.ts picks the cookie or database backend.
 */

const addSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
  variantSelection: z.array(z.string()).nullable().default(null),
});

export type CartActionResult =
  | { ok: true; itemCount: number }
  | { ok: false; error: 'invalid_input' | 'unavailable' | 'out_of_stock' };

/**
 * Adds a line, re-checking availability server-side.
 *
 * The stock and publication checks are not redundant with the UI: a product can
 * sell out or be unpublished between page render and tap, and the demo's control
 * panel can change state underneath an open page.
 */
export async function addCartItem(input: {
  productId: string;
  quantity?: number;
  variantSelection?: string[] | null;
}): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [product] = await db
    .select({
      id: products.id,
      stock: products.stock,
      status: products.status,
      shopStatus: shops.status,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.id, parsed.data.productId)))
    .limit(1);

  if (!product || product.status !== 'published' || product.shopStatus !== 'approved') {
    return { ok: false, error: 'unavailable' };
  }
  if (product.stock <= 0) return { ok: false, error: 'out_of_stock' };

  await addToCart(
    parsed.data.productId,
    Math.min(parsed.data.quantity, product.stock),
    parsed.data.variantSelection,
  );

  revalidatePath('/cart');
  const { getCartCount } = await import('../cart');
  return { ok: true, itemCount: await getCartCount() };
}

export async function updateCartQuantity(
  productId: string,
  quantity: number,
): Promise<CartActionResult> {
  const parsed = z
    .object({ productId: z.string().uuid(), quantity: z.number().int().min(0).max(99) })
    .safeParse({ productId, quantity });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  await setCartQuantity(parsed.data.productId, parsed.data.quantity);
  revalidatePath('/cart');

  const { getCartCount } = await import('../cart');
  return { ok: true, itemCount: await getCartCount() };
}

export async function removeCartItem(productId: string): Promise<CartActionResult> {
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  await removeFromCart(parsed.data);
  revalidatePath('/cart');

  const { getCartCount } = await import('../cart');
  return { ok: true, itemCount: await getCartCount() };
}

export async function emptyCart(): Promise<CartActionResult> {
  await clearCart();
  revalidatePath('/cart');
  return { ok: true, itemCount: 0 };
}
