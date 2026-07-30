import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '..';
import { products, shops } from '../schema';

/**
 * The products a shopper would weigh against this one (Prompt P3).
 *
 * NEAREST PRICE, not newest or best-selling. For a Gulbahar shopper the
 * question is almost always "what else can I get for about this money", and
 * price distance answers it directly — a ranking by rating would put a 58,000
 * afghani phone next to a 1,200 afghani one and call it a comparison.
 *
 * Same category, ANY shop. The point of the table is that the mall has more
 * than one seller of the same kind of thing, so restricting it to the current
 * shop would remove the only reason to draw it.
 *
 * Draft products and unapproved shops are excluded here rather than filtered
 * afterwards, so the "at least two comparable products" rule in the UI counts
 * only rows a customer could actually open (PRD §7.1).
 */
export async function comparableProducts(
  productId: string,
  categoryId: string | null,
  price: number,
  limit = 3,
) {
  if (!categoryId) return [];

  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      attributes: products.attributes,
      brand: products.brand,
      shopName: shops.name,
      shopSlug: shops.slug,
      shopFloor: shops.floor,
      shopUnitNumber: shops.unitNumber,
      imagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = products.id
        order by pi.sort asc limit 1
      )`,
      blurDataUrl: sql<string | null>`(
        select pi.blur_data_url from product_images pi
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
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        eq(products.categoryId, categoryId),
        ne(products.id, productId),
        // Only products that can actually fill a column: a comparison against a
        // product with no specifications is four prices in a row.
        sql`jsonb_array_length(coalesce(${products.attributes}, '[]'::jsonb)) > 0`,
      ),
    )
    // The discounted price is what the shopper compares, when there is one.
    .orderBy(sql`abs(coalesce(${products.discountPrice}, ${products.price}) - ${price})`)
    .limit(limit);
}
