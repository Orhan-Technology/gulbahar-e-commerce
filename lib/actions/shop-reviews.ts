'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { reviewResponses, reviews } from '../db/schema';
import { shopReviewById } from '../db/queries/shop-reviews';
import { shopNameFor } from '../db/queries/shop-orders';
import { notify } from '../notify';

/**
 * Review responses and flagging (PRD §6.5).
 *
 * A shop may answer publicly ONCE — enforced by a unique index on
 * review_responses.review_id (see lib/db/schema/reviews.ts), so a double submit
 * cannot produce two answers even if the UI let it through. A shop cannot edit or
 * delete a customer's review; the only lever is flagging it for admin, and admin
 * decides (PRD §7.2).
 */

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId) return null;
  if (user.role !== 'shopkeeper') return null;
  return { userId: user.id, shopId: user.shopId };
}

const respondSchema = z.object({
  reviewId: z.string().uuid(),
  body: z.string().trim().min(3, { message: 'too_short' }).max(600),
});

export async function respondToReview(
  input: z.input<typeof respondSchema>,
): Promise<ReviewActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { ok: false, error: message === 'too_short' ? 'too_short' : 'invalid_input' };
  }

  const review = await shopReviewById(context.shopId, parsed.data.reviewId);
  if (!review) return { ok: false, error: 'not_found' };
  if (review.responseId) return { ok: false, error: 'already_answered' };

  await db.insert(reviewResponses).values({
    reviewId: review.id,
    shopId: context.shopId,
    body: parsed.data.body,
  });

  const shop = await shopNameFor(context.shopId);
  const locale = review.userLocale ?? 'fa';

  // The customer is told their review was answered, in their own language.
  await notify({
    eventKey: 'review.responded',
    recipientUserId: review.userId,
    recipientRole: 'customer',
    locale,
    values: {
      shopName: shop ? pickLocale(shop.name, locale) : '',
      productTitle: pickLocale(review.productTitle, locale),
    },
  });

  revalidatePath('/dashboard/reviews');
  revalidatePath('/dashboard');
  revalidatePath('/products');
  return { ok: true };
}

/**
 * Flags a review for admin moderation (PRD §6.5, §7.2).
 *
 * Sets status to 'reported', which keeps it visible to customers. Letting a shop
 * hide a review by reporting it would make the rating meaningless — removal is
 * admin's decision alone.
 */
export async function flagReview(reviewId: string): Promise<ReviewActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(reviewId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const review = await shopReviewById(context.shopId, parsed.data);
  if (!review) return { ok: false, error: 'not_found' };
  if (review.status === 'reported') return { ok: false, error: 'already_flagged' };

  await db.update(reviews).set({ status: 'reported' }).where(eq(reviews.id, review.id));

  revalidatePath('/dashboard/reviews');
  revalidatePath('/admin/reviews');
  return { ok: true };
}
