'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { wishlistItems } from '../db/schema';

/**
 * Wishlist mutations (PRD §5.6).
 *
 * Returns a result object rather than throwing, so the optimistic heart in the
 * UI can roll back and show a translated message. `requiresAuth` is a distinct
 * outcome, not an error: an anonymous visitor tapping a heart should be invited
 * to sign in, not shown a failure.
 */

const productIdSchema = z.string().uuid();

export type WishlistResult =
  { ok: true; saved: boolean } | { ok: false; error: 'requires_auth' | 'invalid_product' };

export async function toggleWishlist(productId: string, next: boolean): Promise<WishlistResult> {
  const parsed = productIdSchema.safeParse(productId);
  if (!parsed.success) return { ok: false, error: 'invalid_product' };

  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  if (next) {
    await db
      .insert(wishlistItems)
      .values({ userId: user.id, productId: parsed.data })
      // Idempotent: a double-tap must not error.
      .onConflictDoNothing();
  } else {
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.userId, user.id), eq(wishlistItems.productId, parsed.data)));
  }

  // The wishlist page and its badge read from the database, so they need to know.
  revalidatePath('/account/wishlist');

  return { ok: true, saved: next };
}
