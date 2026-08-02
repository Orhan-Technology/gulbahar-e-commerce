'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { products, reviewVotes, reviews, shopMembers } from '../db/schema';
import { pickLocale } from '../db/localized';
import { reviewableOrderItem, userReviewForProduct } from '../db/queries/reviews';
import { notify } from '../notify';

/**
 * Review write flow (PRD §5.5).
 *
 * The verified-purchase rule is re-checked here, not just in the UI: hiding the
 * form is a courtesy, this check is the actual rule. Without it anyone could
 * submit a review for a product they never bought — exactly the noise the rule
 * exists to prevent.
 */

const schema = z.object({
  productSlug: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
});

export type ReviewResult =
  | { ok: true; mode: 'created' | 'updated' }
  | {
      ok: false;
      error: 'requires_auth' | 'not_purchased' | 'invalid_input' | 'unknown_product';
    };

export async function submitReview(input: {
  productSlug: string;
  rating: number;
  body?: string;
}): Promise<ReviewResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const [product] = await db
    .select({ id: products.id, shopId: products.shopId, title: products.title })
    .from(products)
    .where(eq(products.slug, parsed.data.productSlug))
    .limit(1);

  if (!product) return { ok: false, error: 'unknown_product' };

  // One review per customer per product, editable (PRD §5.5).
  const existing = await userReviewForProduct(user.id, product.id);
  if (existing) {
    await db
      .update(reviews)
      .set({ rating: parsed.data.rating, body: parsed.data.body ?? null })
      .where(and(eq(reviews.id, existing.id), eq(reviews.userId, user.id)));

    revalidatePath(`/products/${parsed.data.productSlug}`);
    return { ok: true, mode: 'updated' };
  }

  const entitlement = await reviewableOrderItem(user.id, product.id);
  if (!entitlement) return { ok: false, error: 'not_purchased' };

  await db.insert(reviews).values({
    productId: product.id,
    userId: user.id,
    orderItemId: entitlement.orderItemId,
    rating: parsed.data.rating,
    body: parsed.data.body ?? null,
  });

  // Tell the shop, so it reaches their dashboard and the notification log.
  const [owner] = await db
    .select({ userId: shopMembers.userId })
    .from(shopMembers)
    .where(and(eq(shopMembers.shopId, product.shopId), eq(shopMembers.role, 'owner')))
    .limit(1);

  await notify({
    eventKey: 'review.received',
    channel: 'inapp',
    recipientUserId: owner?.userId ?? null,
    recipientRole: 'shopkeeper',
    locale: 'fa',
    values: {
      productTitle: pickLocale(product.title, 'fa'),
      rating: parsed.data.rating,
    },
  });

  revalidatePath(`/products/${parsed.data.productSlug}`);
  return { ok: true, mode: 'created' };
}

export type HelpfulResult =
  | { ok: true; helpful: boolean }
  | { ok: false; error: 'requires_auth' | 'invalid_input' | 'not_found' | 'own_review' };

/**
 * "Was this helpful?" — one vote per person per review, no downvote.
 *
 * TAKES THE DESIRED STATE rather than toggling, the same way setShopFollow does:
 * a double tap on a mall's wifi otherwise lands as two toggles and the button
 * ends up disagreeing with the database about which way round they finished.
 *
 * The composite primary key is the real enforcement, so the insert is an
 * `onConflictDoNothing` — a second vote from the same thumb is not an error, it
 * is a no-op that already has the outcome the caller asked for. The catch below
 * covers the same collision arriving as a raised error rather than a swallowed
 * one; note that drizzle wraps driver errors in DrizzleQueryError, whose own
 * `code` is undefined — the PostgresError carrying SQLSTATE 23505 is at
 * `.cause` (CLAUDE.md), and checking the wrapper would make this dead code.
 *
 * NOBODY VOTES FOR THEMSELVES. It is enforced in the WHERE clause that resolves
 * the review, not by a check beforehand, so a forged review id cannot route
 * around it.
 */
export async function setReviewHelpful(reviewId: string, helpful: boolean): Promise<HelpfulResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = z.string().uuid().safeParse(reviewId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [review] = await db
    .select({ id: reviews.id, authorId: reviews.userId, productId: reviews.productId })
    .from(reviews)
    .where(and(eq(reviews.id, parsed.data), eq(reviews.status, 'visible')))
    .limit(1);

  if (!review) return { ok: false, error: 'not_found' };
  if (review.authorId === user.id) return { ok: false, error: 'own_review' };

  try {
    if (helpful) {
      await db
        .insert(reviewVotes)
        .values({ reviewId: review.id, userId: user.id })
        .onConflictDoNothing();
    } else {
      await db
        .delete(reviewVotes)
        .where(and(eq(reviewVotes.reviewId, review.id), eq(reviewVotes.userId, user.id)));
    }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code !== '23505') throw error;
  }

  const [product] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, review.productId))
    .limit(1);

  if (product) revalidatePath(`/products/${product.slug}`);
  return { ok: true, helpful };
}

/**
 * Deletes the author's own review (Prompt A2, /account/reviews).
 *
 * A hard delete, unlike admin moderation which sets `status = 'removed'` and
 * keeps the row for audit. The difference is deliberate: moderation is a
 * decision ABOUT someone that has to stay on the record, while this is a person
 * withdrawing their own words, and the order line becomes reviewable again —
 * which the unique key on `order_item_id` allows only if the row is actually
 * gone.
 *
 * `userId` in the WHERE clause is the authorisation check, not a check done
 * beforehand, so a forged review id cannot reach someone else's row.
 */
export async function deleteMyReview(
  reviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = z.string().uuid().safeParse(reviewId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [deleted] = await db
    .delete(reviews)
    .where(and(eq(reviews.id, parsed.data), eq(reviews.userId, user.id)))
    .returning({ productId: reviews.productId });

  if (!deleted) return { ok: false, error: 'not_found' };

  const [product] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, deleted.productId))
    .limit(1);

  if (product) revalidatePath(`/products/${product.slug}`);
  revalidatePath('/account/reviews');
  return { ok: true };
}
