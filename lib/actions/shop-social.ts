'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { orderItems, orders, shopFollows, shopReviewRows, shops } from '../db/schema';

/**
 * Following a shop, and reviewing its service (Prompt C8).
 */

export type SocialResult = { ok: true; following?: boolean } | { ok: false; error: string };

/**
 * Follow / unfollow, idempotently.
 *
 * The action takes the DESIRED state rather than toggling, so a double tap on a
 * slow connection cannot end with the button and the database disagreeing —
 * two toggles land as two follows, and the second one wins with the same
 * answer.
 */
export async function setShopFollow(shopId: string, following: boolean): Promise<SocialResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = z.string().uuid().safeParse(shopId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [shop] = await db
    .select({ slug: shops.slug })
    .from(shops)
    .where(and(eq(shops.id, parsed.data), eq(shops.status, 'approved')))
    .limit(1);

  if (!shop) return { ok: false, error: 'not_found' };

  if (following) {
    await db
      .insert(shopFollows)
      .values({ userId: user.id, shopId: parsed.data })
      .onConflictDoNothing();
  } else {
    await db
      .delete(shopFollows)
      .where(and(eq(shopFollows.userId, user.id), eq(shopFollows.shopId, parsed.data)));
  }

  revalidatePath(`/shops/${shop.slug}`);
  revalidatePath('/account');
  return { ok: true, following };
}

const reviewSchema = z.object({
  shopId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
});

/**
 * Reviews the SHOP's service.
 *
 * The entitlement is re-checked here, not just in the UI: a fulfilled order
 * from this shop that has not already been reviewed. Without it anyone could
 * rate a shop they have never bought from, which is the noise the
 * verified-purchase rule exists to keep out (PRD §5.5).
 *
 * The order is chosen by the SERVER, not passed in — a client that picked its
 * own order id could review one shop's service against another shop's order.
 */
export async function submitShopReview(
  input: z.input<typeof reviewSchema>,
): Promise<SocialResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  /*
   * The most recent fulfilled order from this shop that has NOT already been
   * reviewed. Both halves matter.
   *
   * Picking the order SERVER-SIDE is the point of the first half: a client that
   * passed its own order id could review one shop's service against another
   * shop's order, and the unique key would happily accept it.
   *
   * Excluding reviewed orders is the second: without it a customer with two
   * fulfilled orders would keep landing on the same row, and every new review
   * would overwrite the previous one — the shop's history of getting better or
   * worse would be one line deep forever.
   */
  const [entitlement] = await db
    .select({ orderId: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, user.id),
        eq(orderItems.shopId, parsed.data.shopId),
        eq(orders.status, 'fulfilled'),
        sql`not exists (
          select 1 from shop_reviews sr
          where sr.order_id = orders.id and sr.shop_id = ${parsed.data.shopId}
        )`,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!entitlement) return { ok: false, error: 'not_purchased' };

  await db.insert(shopReviewRows).values({
    shopId: parsed.data.shopId,
    userId: user.id,
    orderId: entitlement.orderId,
    rating: parsed.data.rating,
    body: parsed.data.body ?? null,
  });

  const [shop] = await db
    .select({ slug: shops.slug })
    .from(shops)
    .where(eq(shops.id, parsed.data.shopId))
    .limit(1);

  if (shop) revalidatePath(`/shops/${shop.slug}`);
  return { ok: true };
}
