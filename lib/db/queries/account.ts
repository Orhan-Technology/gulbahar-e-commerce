import { cache } from 'react';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '..';
import {
  addresses,
  orders,
  productImages,
  products,
  reviewResponses,
  reviews,
  shops,
  users,
} from '../schema';

/**
 * The account hub's own reads (Prompt A2).
 *
 * Kept out of queries/orders.ts, which owns the order lifecycle: this module
 * answers "what is in this person's account", which is a different question
 * that happens to count orders among other things.
 */

/**
 * Identity and credential STATE for the profile panel.
 *
 * `hasPassword` rather than the hash: whether a password exists drives the
 * panel's "Set a password" / "Updated {date}" branch, and the hash itself has
 * no reason to leave the server (A1).
 */
export const accountProfile = cache(async (userId: string) => {
  const [row] = await db
    .select({
      name: users.name,
      phone: users.phone,
      locale: users.locale,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      passwordUpdatedAt: users.passwordUpdatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ?? null;
});

/**
 * Every count the hub's section cards and stat chips show, in one round trip.
 *
 * Reviews count only `visible` ones — a removed review is not something to
 * offer the author a door to.
 */
export const accountCounts = cache(async (userId: string) => {
  const rows = await db.execute(sql`
    select
      (select count(*)::int from orders where user_id = ${userId}) as orders,
      (select count(*)::int from wishlist_items where user_id = ${userId}) as wishlist,
      (select count(*)::int from reviews where user_id = ${userId} and status = 'visible') as reviews,
      (select count(*)::int from addresses where user_id = ${userId}) as addresses
  `);

  const [row] = rows as unknown as Array<{
    orders: number;
    wishlist: number;
    reviews: number;
    addresses: number;
  }>;

  return {
    orders: Number(row?.orders ?? 0),
    wishlist: Number(row?.wishlist ?? 0),
    reviews: Number(row?.reviews ?? 0),
    addresses: Number(row?.addresses ?? 0),
  };
});

/** Saved addresses, oldest first — the order the manager has always shown. */
export const accountAddresses = cache(async (userId: string) => {
  return db
    .select({
      id: addresses.id,
      label: addresses.label,
      district: addresses.district,
      streetDetails: addresses.streetDetails,
      phone: addresses.phone,
    })
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(asc(addresses.createdAt));
});

/**
 * Which saved address counts as the DEFAULT (finding #14).
 *
 * DERIVED, not declared. The profile card has always said «آدرس پیش‌فرض» and
 * checkout has always silently preselected `addresses[0]` — the OLDEST row —
 * which for anyone who has moved is the address they no longer live at. There
 * is no `is_default` column and the schema is frozen for this pass, so the
 * default is read out of behaviour instead: the address the customer most
 * recently sent an order to is the one they mean by "my address".
 *
 * `addressId` is ON DELETE SET NULL, so a deleted address drops out of this
 * naturally rather than returning an id that resolves to nothing; the caller
 * still checks the id against the live list before using it, because an order
 * may name an address that has since been removed AND recreated.
 *
 * Returns null for an account that has never ordered, and the caller falls back
 * to the previous behaviour — which is the correct answer there: with no
 * evidence, the first saved address is as good a guess as any.
 */
export const defaultAddressId = cache(async (userId: string) => {
  const [row] = await db
    .select({ id: orders.addressId })
    .from(orders)
    .where(and(eq(orders.userId, userId), isNotNull(orders.addressId)))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  return row?.id ?? null;
});

/**
 * The reviews this customer has written, newest first (Prompt A2).
 *
 * Carries the product it is about — slug, title, thumbnail — because a review
 * out of context is a rating with no subject, and the row has to link back to
 * what was reviewed. Any shop reply comes with it: the reply is the half of the
 * conversation the author has not seen unless they revisit the product page.
 *
 * `visible` only. A review the admin removed is gone from the customer's own
 * list too — offering an edit box for something nobody can read would be a
 * worse answer than not listing it.
 */
export async function myReviews(userId: string) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      createdAt: reviews.createdAt,
      productSlug: products.slug,
      productTitle: products.title,
      productImage: sql<string | null>`(
        select pi.path from ${productImages} pi
        where pi.product_id = ${products.id}
        order by pi.sort asc
        limit 1
      )`,
      shopName: shops.name,
      responseBody: reviewResponses.body,
      responseCreatedAt: reviewResponses.createdAt,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .innerJoin(shops, eq(products.shopId, shops.id))
    .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
    .where(and(eq(reviews.userId, userId), eq(reviews.status, 'visible')))
    .orderBy(desc(reviews.createdAt));
}
