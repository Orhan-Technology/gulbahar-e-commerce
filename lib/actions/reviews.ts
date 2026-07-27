'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { products, reviews, shopMembers } from '../db/schema';
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
