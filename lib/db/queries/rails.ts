import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '..';
import { products, shops } from '../schema';

/**
 * The product page's discovery rails (Prompt P5).
 *
 * THREE rails, each with genuinely different logic, and no more. Best Buy runs
 * four because they have millions of SKUs; Gulbahar has about seventy-five
 * across fourteen shops, and a fourth rail would show the same product twice
 * and make the catalogue feel smaller than it is.
 */

const railColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  price: products.price,
  discountPrice: products.discountPrice,
  stock: products.stock,
  shopId: products.shopId,
  shopName: shops.name,
  shopFloor: shops.floor,
  imagePath: sql<string | null>`(
    select pi.path from product_images pi
    where pi.product_id = products.id
    order by pi.sort asc limit 1
  )`,
  rating: sql<number>`coalesce((
    select avg(r.rating)::float8 from reviews r
    where r.product_id = products.id and r.status = 'visible'
  ), 0)`,
  reviewCount: sql<number>`(
    select count(*)::int from reviews r
    where r.product_id = products.id and r.status = 'visible'
  )`,
};

export type RailProduct = {
  id: string;
  slug: string;
  title: unknown;
  price: number;
  discountPrice: number | null;
  stock: number;
  shopId: string;
  shopName: unknown;
  shopFloor: number | null;
  imagePath: string | null;
  rating: number;
  reviewCount: number;
};

/**
 * "More from this shop" — same shop, any category.
 *
 * This is the rail that gives the mall its meaning: you are not buying from a
 * catalogue, you are buying from a shop on the second floor that also sells
 * these other things. In-stock first, then the most-viewed, because a rail full
 * of sold-out products is an advert for going somewhere else.
 */
export async function moreFromShop(shopId: string, excludeProductId: string, limit = 12) {
  return db
    .select(railColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.shopId, shopId),
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        ne(products.id, excludeProductId),
      ),
    )
    .orderBy(sql`case when ${products.stock} > 0 then 0 else 1 end`, sql`${products.viewCount} desc`)
    .limit(limit);
}

/**
 * "Similar products" — OTHER shops, nearest price, related category.
 *
 * Other shops on purpose: the same-shop rail above already covers this shop,
 * and a marketplace's whole claim is that you can see what the shop next door
 * charges. This is also where paid placement legitimately belongs — the items
 * are relevant by construction, so a Sponsored one among them is a position
 * bought among matching results rather than an intrusion.
 *
 * RELATED CATEGORY, NOT THE LEAF ONE, and that is a fact about this mall
 * rather than a loosening of the rule. Every Gulbahar category is stocked by
 * exactly one tenant — the shoes shop sells the shoes, the watch shop sells the
 * watches — so "same leaf category, other shops" matches nothing at all, and
 * the rail would never render for a single product in the catalogue. Widening
 * one level to the PARENT category gives the shoes page the clothing shop and
 * the bag shop, which is what a shopper walking that floor would actually see
 * next.
 *
 * The comparison table (P3) deliberately does NOT widen: comparing specs needs
 * like for like, and a shoe against a handbag is not a comparison. Discovery
 * and comparison are different jobs and are allowed different radii.
 */
export async function similarFromOtherShops(
  productId: string,
  categoryId: string | null,
  shopId: string,
  price: number,
  limit = 12,
) {
  if (!categoryId) return [];

  return db
    .select(railColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        sql`${products.categoryId} in (
          select c.id from categories c
          where c.id = ${categoryId}
             or c.parent_id = (select parent_id from categories where id = ${categoryId})
        )`,
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        ne(products.id, productId),
        ne(products.shopId, shopId),
      ),
    )
    .orderBy(sql`abs(coalesce(${products.discountPrice}, ${products.price}) - ${price})`)
    .limit(limit);
}

/**
 * Products by id, for the recently-viewed rail (Prompt P5).
 *
 * The LIST lives in the browser — it is one person's history and has no
 * business in the database — so the ids arrive from localStorage and this
 * turns them into cards. Order is restored by the caller: `in (…)` has no
 * order, and the rail's whole meaning is "most recent first".
 *
 * Unpublished products and unapproved shops fall out here, which is also the
 * cleanup path: a browser holding an id from before `db:reset` simply gets
 * nothing back for it rather than a broken card (CLAUDE.md — anything the
 * browser holds outlives the row it names).
 */
export async function productsByIds(ids: string[]) {
  if (ids.length === 0) return [];

  return db
    .select(railColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        inArray(products.id, ids),
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
      ),
    )
    .limit(24);
}
