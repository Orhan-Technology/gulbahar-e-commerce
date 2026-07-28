import { sql, type SQL } from 'drizzle-orm';

/**
 * Correlated subquery fragments, written as fully-qualified raw SQL.
 *
 * WHY RAW: drizzle renders an interpolated `${table.column}` UNQUALIFIED when it
 * appears inside a `sql` template in a select list. So this —
 *
 *   sql`(select path from ${productImages}
 *        where ${productImages.productId} = ${products.id} ...)`
 *
 * emits `where "product_id" = "id"`, and inside a subquery scoped to
 * product_images BOTH sides resolve to product_images. The condition is then
 * never true and the column silently returns NULL — no error, just missing
 * images everywhere. Where another joined table also has an `id`, the same bug
 * surfaces as "column reference is ambiguous" instead.
 *
 * Writing the inner query as literal SQL with explicit aliases (`pi`, `r`, `oi`)
 * and an explicit outer qualification (`products.id`) removes both failure modes.
 *
 * Each fragment documents which table must be in the OUTER query's FROM clause,
 * because that is what the outer qualification binds to.
 *
 * EVERY aggregate IS EXPLICITLY CAST. Postgres count()/sum() return bigint and
 * avg() returns numeric; postgres.js maps both to JavaScript STRINGS to avoid
 * precision loss. Without ::int / ::float8 a fragment typed SQL<number> silently
 * yields "6" instead of 6 — comparisons like `=== 6` fail and `count + 1` gives
 * "61". Casting in SQL makes the declared TypeScript types honest at runtime.
 */

/** Outer query must select FROM products. */
export const firstProductImagePath: SQL<string | null> = sql<string | null>`(
  select pi.path from product_images pi
  where pi.product_id = products.id
  order by pi.sort asc
  limit 1
)`;

/** Outer query must select FROM products. Visible reviews only. */
export const productRatingAvg: SQL<number> = sql<number>`coalesce((
  select avg(r.rating)::float8 from reviews r
  where r.product_id = products.id and r.status = 'visible'
), 0)`;

/** Outer query must select FROM products. */
export const productReviewCount: SQL<number> = sql<number>`(
  select count(*)::int from reviews r
  where r.product_id = products.id and r.status = 'visible'
)`;

/** Outer query must select FROM products. */
export const productWishlistCount: SQL<number> = sql<number>`(
  select count(*)::int from wishlist_items wi
  where wi.product_id = products.id
)`;

/**
 * Shop rating derived from that shop's product reviews (PRD §5.5) rather than
 * stored, so it can never drift from the reviews it summarises.
 * Outer query must select FROM shops.
 */
export const shopRatingAvg: SQL<number> = sql<number>`coalesce((
  select avg(r.rating)::float8 from reviews r
  join products p on p.id = r.product_id
  where p.shop_id = shops.id and r.status = 'visible'
), 0)`;

/** Outer query must select FROM shops. */
export const shopReviewCount: SQL<number> = sql<number>`(
  select count(*)::int from reviews r
  join products p on p.id = r.product_id
  where p.shop_id = shops.id and r.status = 'visible'
)`;

/** Outer query must select FROM shops. Published products only. */
export const shopPublishedProductCount: SQL<number> = sql<number>`(
  select count(*)::int from products p
  where p.shop_id = shops.id and p.status = 'published'
)`;

/** Outer query must select FROM shops. Counts drafts too, for the admin queue. */
export const shopTotalProductCount: SQL<number> = sql<number>`(
  select count(*)::int from products p
  where p.shop_id = shops.id
)`;

/**
 * Outer query must select FROM categories. Publicly visible products only.
 *
 * Counts the category's own products AND its children's. Every seeded product
 * sits in a LEAF category — nothing is filed directly under a root — so the
 * direct-members-only version this replaces returned 0 for all eight root
 * categories, and the home page's category tiles each rendered a zero.
 *
 * Two levels is the whole taxonomy (roots + leaves, verified: max depth 2), so
 * self-or-child is exact rather than an approximation. A third level would be
 * undercounted, which is why the join is on the product's category row: adding
 * `or pc.parent_id in (...)` there is the only change a deeper tree would need.
 */
export const categoryProductCount: SQL<number> = sql<number>`(
  select count(*)::int from products p
  join shops s on s.id = p.shop_id
  join categories pc on pc.id = p.category_id
  where (pc.id = categories.id or pc.parent_id = categories.id)
    and p.status = 'published' and s.status = 'approved'
)`;

/** Outer query must select FROM orders. */
export const orderItemQuantity: SQL<number> = sql<number>`(
  select coalesce(sum(oi.quantity), 0)::int from order_items oi
  where oi.order_id = orders.id
)`;

/** Outer query must select FROM orders. */
export const orderShopCount: SQL<number> = sql<number>`(
  select count(distinct oi.shop_id)::int from order_items oi
  where oi.order_id = orders.id
)`;

/** Outer query must select FROM order_items. */
export const orderItemImagePath: SQL<string | null> = sql<string | null>`(
  select pi.path from product_images pi
  where pi.product_id = order_items.product_id
  order by pi.sort asc
  limit 1
)`;
