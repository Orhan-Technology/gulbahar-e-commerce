'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { addToCart, clearCart, removeFromCart, setCartQuantity } from '../cart';
import { db } from '../db';
import { products, shops } from '../db/schema';
import { toggleWishlist } from './wishlist';

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
  | {
      ok: true;
      itemCount: number;
      /**
       * Set when the requested quantity was reduced to what the shop has. The
       * caller says so rather than letting the stepper silently spring back —
       * a number that changes by itself reads as a bug.
       */
      clampedTo?: number;
    }
  | { ok: false; error: 'invalid_input' | 'unavailable' | 'out_of_stock' | 'shop_paused' };

/**
 * Adds a line, re-checking availability server-side.
 *
 * The stock and publication checks are not redundant with the UI: a product can
 * sell out or be unpublished between page render and tap, and the demo's control
 * panel can change state underneath an open page. The same is true of a shop
 * going on vacation — the buy button on an already-open page knows nothing
 * about it, so the rule lives here and not in the component that draws it.
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
      // Compared in SQL rather than against a JS clock: React 19 forbids an
      // impure read during render, and the database's `now()` is the same one
      // every other pause query in the codebase compares against.
      shopPaused: sql<boolean>`${shops.pausedUntil} is not null and ${shops.pausedUntil} > now()`,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.id, parsed.data.productId)))
    .limit(1);

  if (!product || product.status !== 'published' || product.shopStatus !== 'approved') {
    return { ok: false, error: 'unavailable' };
  }
  if (product.shopPaused) return { ok: false, error: 'shop_paused' };
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

  const applied = await setCartQuantity(parsed.data.productId, parsed.data.quantity);
  revalidatePath('/cart');

  const { getCartCount } = await import('../cart');
  return {
    ok: true,
    itemCount: await getCartCount(),
    ...(applied > 0 && applied < parsed.data.quantity ? { clampedTo: applied } : {}),
  };
}

export async function removeCartItem(productId: string): Promise<CartActionResult> {
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  await removeFromCart(parsed.data);
  revalidatePath('/cart');

  const { getCartCount } = await import('../cart');
  return { ok: true, itemCount: await getCartCount() };
}

export type SaveForLaterResult =
  | { ok: true; itemCount: number }
  | { ok: false; error: 'invalid_input' | 'requires_auth' };

/**
 * Moves a line out of the basket and into the wishlist (PRD §5.6).
 *
 * The counterpart of the wishlist's "move to cart", and the reason it matters
 * is what people do without it: a shopper who is not ready to buy one of five
 * lines DELETES it, and then has to find the product again. Saving keeps the
 * decision reversible without keeping the basket total wrong.
 *
 * REQUIRES AN ACCOUNT, because the wishlist does — it is a table, not a cookie.
 * A guest is told to sign in rather than having the line silently removed into
 * nowhere, so the failure is never "my item vanished".
 */
export async function saveCartItemForLater(productId: string): Promise<SaveForLaterResult> {
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  // Wishlist first: if it cannot be saved, the line stays in the basket.
  const saved = await toggleWishlist(parsed.data, true);
  if (!saved.ok) {
    return { ok: false, error: saved.error === 'requires_auth' ? 'requires_auth' : 'invalid_input' };
  }

  await removeFromCart(parsed.data);
  revalidatePath('/cart');
  revalidatePath('/account/wishlist');

  const { getCartCount } = await import('../cart');
  return { ok: true, itemCount: await getCartCount() };
}

export async function emptyCart(): Promise<CartActionResult> {
  await clearCart();
  revalidatePath('/cart');
  return { ok: true, itemCount: 0 };
}
