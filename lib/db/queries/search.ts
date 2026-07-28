import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '..';
import { searchKey, searchKeyForInput } from '../localized';
import { categories, products, shops } from '../schema';
import {
  firstProductImagePath,
  productRatingAvg,
  productReviewCount,
  shopPublishedProductCount,
  shopRatingAvg,
} from './fragments';

/**
 * Trigram search (PRD §12.3).
 *
 * Ranked by similarity first, then rating — so relevance leads and quality
 * breaks ties. Paid placement is NOT part of this ranking: search_top campaigns
 * are fetched separately and rendered above these results with a Sponsored
 * badge, which is what keeps "a shop can buy the top slot, not a better score"
 * true (PRD §8.4).
 *
 * The similarity threshold is deliberately low. At 80 seeded products a
 * generous threshold feels responsive, and a demo that returns nothing for a
 * near-miss spelling reads as broken.
 */
const SIMILARITY_THRESHOLD = 0.12;

export type ProductSearchResult = {
  id: string;
  slug: string;
  title: (typeof products.$inferSelect)['title'];
  price: number;
  discountPrice: number | null;
  stock: number;
  shopId: string;
  shopSlug: string;
  shopName: (typeof shops.$inferSelect)['name'];
  shopFloor: number | null;
  imagePath: string | null;
  rating: number;
  reviewCount: number;
  similarity: number;
};

export async function searchProducts(
  term: string,
  options: { limit?: number; locale?: string } = {},
): Promise<ProductSearchResult[]> {
  const query = term.trim();
  if (!query) return [];

  const limit = options.limit ?? 24;
  const haystack = searchKey(products.title);
  const needle = searchKeyForInput(query);
  const similarity = sql<number>`similarity(${haystack}, ${needle})`;
  const ratingExpr = productRatingAvg;

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: ratingExpr,
      reviewCount: productReviewCount,
      similarity,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        /*
         * A substring match OR a fuzzy match. The ILIKE arm matters because
         * trigram similarity is length-sensitive: searching "a54" against a long
         * title scores low even though it is an exact substring.
         */
        sql`(${haystack} like '%' || ${needle} || '%' or ${similarity} > ${SIMILARITY_THRESHOLD})`,
      ),
    )
    .orderBy(desc(similarity), desc(ratingExpr))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
    similarity: Number(row.similarity),
  }));
}

export async function searchShops(term: string, options: { limit?: number } = {}) {
  const query = term.trim();
  if (!query) return [];

  const limit = options.limit ?? 12;
  const haystack = searchKey(shops.name);
  const needle = searchKeyForInput(query);
  const similarity = sql<number>`similarity(${haystack}, ${needle})`;
  const ratingExpr = shopRatingAvg;

  const rows = await db
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      categoryName: categories.name,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      rating: ratingExpr,
      productCount: shopPublishedProductCount,
      similarity,
    })
    .from(shops)
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .where(
      and(
        eq(shops.status, 'approved'),
        sql`(${haystack} like '%' || ${needle} || '%' or ${similarity} > ${SIMILARITY_THRESHOLD})`,
      ),
    )
    .orderBy(desc(similarity), desc(ratingExpr))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    productCount: Number(row.productCount),
    similarity: Number(row.similarity),
  }));
}

/**
 * Header type-ahead payload (PRD §5.2): top 5 products plus 2 shops.
 */
export async function searchSuggestions(term: string, locale: string) {
  const [products, shops] = await Promise.all([
    searchProducts(term, { limit: 5, locale }),
    searchShops(term, { limit: 2 }),
  ]);
  return { products, shops };
}
