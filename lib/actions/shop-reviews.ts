'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { reviewResponses, reviews } from '../db/schema';
import { shopReviewById } from '../db/queries/shop-reviews';
import { shopNameFor } from '../db/queries/shop-orders';
import { notify } from '../notify';
// The category list lives outside this file: a 'use server' module may export
// only async functions, so a plain const here would not build.
import { REVIEW_FLAG_REASONS } from '../review-flags';

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

const flagSchema = z.object({
  reviewId: z.string().uuid(),
  reason: z.enum(REVIEW_FLAG_REASONS, { message: 'reason_required' }),
  /** Free text, optional — the detail a category cannot carry. */
  note: z.string().trim().max(300).optional().nullable(),
});

/**
 * Flags a review for admin moderation (PRD §6.5, §7.2).
 *
 * Sets status to 'reported', which keeps it visible to customers. Letting a shop
 * hide a review by reporting it would make the rating meaningless — removal is
 * admin's decision alone.
 *
 * The reason travels to the admin as a NOTIFICATION rather than as a new column:
 * reviews has no field for it and the schema is fixed here, while notify() already
 * stores its values as a payload the moderation queue's log renders. That also
 * means the report is timestamped and attributable, which a column overwritten by
 * the next reporter would not be.
 */
export async function flagReview(
  input: z.input<typeof flagSchema>,
): Promise<ReviewActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { ok: false, error: message === 'reason_required' ? message : 'invalid_input' };
  }

  const review = await shopReviewById(context.shopId, parsed.data.reviewId);
  if (!review) return { ok: false, error: 'not_found' };
  if (review.status === 'reported') return { ok: false, error: 'already_flagged' };

  await db.update(reviews).set({ status: 'reported' }).where(eq(reviews.id, review.id));

  const shop = await shopNameFor(context.shopId);
  /*
   * The category is interpolated as its LABEL, not as its key. Admin messages
   * are written in Dari (notify's default), and "offensive" arriving raw in the
   * moderation queue would be the same class of bug as a stored key path in an
   * SMS body — the reason exists to be read.
   */
  const reasons = await getTranslations({ locale: 'fa', namespace: 'shopReviews.flagReasons' });

  await notify({
    eventKey: 'review.flagged',
    recipientUserId: null,
    recipientRole: 'admin',
    channel: 'inapp',
    values: {
      shopName: shop ? pickLocale(shop.name, 'fa') : '',
      productTitle: pickLocale(review.productTitle, 'fa'),
      reason: reasons(parsed.data.reason),
      note: parsed.data.note?.trim() || '',
      /*
       * Carried so the moderation queue can find THIS report rather than
       * inferring it. Without an id the admin screen had to match on product
       * title plus shop name and then give up unless the product happened to
       * have exactly one reported review — correct, but blank precisely when a
       * product is being reported repeatedly, which is when the reason matters
       * most. It is not rendered into the message body; it exists to be joined
       * on.
       */
      reviewId: parsed.data.reviewId,
    },
  });

  revalidatePath('/dashboard/reviews');
  revalidatePath('/admin/reviews');
  return { ok: true };
}
