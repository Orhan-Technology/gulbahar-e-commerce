import { and, asc, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';

import { db } from '..';
import { localizedColumn, searchKey, searchKeyForInput } from '../localized';
import { categories, products, shops, type LocalizedText } from '../schema';
import {
  categoryProductCount,
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
export const SIMILARITY_THRESHOLD = 0.12;

/**
 * The localized-name search key for a table ALIAS inside a correlated subquery.
 *
 * `searchKey()` takes a drizzle column and renders it qualified by its real
 * table name, which is wrong inside `from categories c` — and self-joining
 * categories to reach the parent needs two different aliases for one table.
 * Spelled out here so the expression stays textually identical to the index in
 * lib/db/sql/search.sql; if the two drift the GIN index is silently ignored.
 */
function aliasSearchKey(alias: string, column: string): SQL<string> {
  return sql<string>`gulbahar_search_key(
    coalesce(${sql.raw(alias)}.${sql.raw(column)}->>'fa', '') || ' ' ||
    coalesce(${sql.raw(alias)}.${sql.raw(column)}->>'en', '') || ' ' ||
    coalesce(${sql.raw(alias)}.${sql.raw(column)}->>'ps', '')
  )`;
}

/** `haystack` contains the needle, or is close enough to it to be a near-miss. */
function matches(haystack: SQL<string>, needle: SQL<string>): SQL {
  return sql`(${haystack} like '%' || ${needle} || '%' or similarity(${haystack}, ${needle}) > ${SIMILARITY_THRESHOLD})`;
}

/**
 * Does this product answer the term? (PRD §12.3)
 *
 * TITLE IS NOT ENOUGH, and that was the single largest hole in discovery: the
 * most obvious queries a shopper types are CATEGORY words. «موبایل» is nobody's
 * product title — it is the name of the aisle — so a title-only search returned
 * zero for it while eleven phones sat one click away. Shop names have the same
 * problem («عطریات طلایی» sells perfume whose titles never say the shop), and so
 * does a brand typed on its own.
 *
 * So a product matches on any of four surfaces: its own title, its category (or
 * that category's parent, because every product is filed in a leaf), its shop's
 * name, and its brand. The category arm is an EXISTS rather than a join so the
 * caller's GROUP BY and its result count are unaffected.
 *
 * Outer query must select FROM products with `shops` joined.
 */
export function productSearchMatch(needle: SQL<string>): SQL {
  return sql`(
    ${matches(searchKey(products.title), needle)}
    or ${matches(searchKey(shops.name), needle)}
    or (products.brand is not null and ${matches(sql<string>`gulbahar_search_key(products.brand)`, needle)})
    or exists (
      select 1 from categories c
      left join categories pc on pc.id = c.parent_id
      where c.id = products.category_id
        and (
          ${matches(aliasSearchKey('c', 'name'), needle)}
          or (pc.id is not null and ${matches(aliasSearchKey('pc', 'name'), needle)})
        )
    )
  )`;
}

/**
 * How WELL it answers it — the ordering behind "popularity" once a term narrows
 * the list.
 *
 * WEIGHTED BY SURFACE, because the surfaces are not equally specific. A title
 * hit is the shopper naming the thing; a category hit is them naming the aisle,
 * which is true of every product on the shelf and so must never outrank the one
 * whose name they actually typed. The substring arm scores near the top on its
 * own: trigram similarity is length-sensitive, so "a54" against a long title
 * scores low despite being an exact substring of it.
 */
export function productSearchRelevance(needle: SQL<string>): SQL<number> {
  const title = searchKey(products.title);
  return sql<number>`greatest(
    similarity(${title}, ${needle}),
    case when ${title} like '%' || ${needle} || '%' then 0.95 else 0 end,
    0.55 * similarity(${searchKey(shops.name)}, ${needle}),
    0.6 * coalesce(similarity(gulbahar_search_key(products.brand), ${needle}), 0),
    0.7 * coalesce((
      select max(greatest(
        similarity(${aliasSearchKey('c', 'name')}, ${needle}),
        coalesce(similarity(${aliasSearchKey('pc', 'name')}, ${needle}), 0)
      ))
      from categories c
      left join categories pc on pc.id = c.parent_id
      where c.id = products.category_id
    ), 0)
  )`;
}

/** True when the term appears LITERALLY somewhere — i.e. this is not a near-miss. */
export function productSearchExact(needle: SQL<string>): SQL {
  return sql`(
    ${searchKey(products.title)} like '%' || ${needle} || '%'
    or ${searchKey(shops.name)} like '%' || ${needle} || '%'
    or gulbahar_search_key(products.brand) like '%' || ${needle} || '%'
    or exists (
      select 1 from categories c
      left join categories pc on pc.id = c.parent_id
      where c.id = products.category_id
        and (
          ${aliasSearchKey('c', 'name')} like '%' || ${needle} || '%'
          or ${aliasSearchKey('pc', 'name')} like '%' || ${needle} || '%'
        )
    )
  )`;
}

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
  const needle = searchKeyForInput(query);
  const similarity = productSearchRelevance(needle);
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
        productSearchMatch(needle),
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
      // Selected so a shop found by search carries the same "on vacation" badge
      // it wears in the directory. Without it the badge depended on which route
      // the customer arrived through, which is the kind of inconsistency that
      // reads as the badge being unreliable.
      pausedUntil: shops.pausedUntil,
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

export type CategorySearchResult = {
  id: string;
  slug: string;
  name: LocalizedText;
  parentSlug: string | null;
  productCount: number;
  similarity: number;
};

/**
 * Categories whose name answers the term (PRD §12.3).
 *
 * The recovery path for a zero-result search, and the reason it exists: the
 * queries that found nothing were overwhelmingly AISLE WORDS. Telling a shopper
 * "no products for «موبایل» — but «موبایل و تابلت» has 11" turns a dead end into
 * one tap, which is the whole difference between a search box that works and
 * one that is a lottery.
 *
 * Only categories that have something behind them are returned: a suggestion
 * chip leading to an empty listing is a second dead end wearing a helpful face.
 */
export async function searchCategories(
  term: string,
  options: { limit?: number } = {},
): Promise<CategorySearchResult[]> {
  const query = term.trim();
  if (!query) return [];

  const limit = options.limit ?? 6;
  const haystack = searchKey(categories.name);
  const needle = searchKeyForInput(query);
  const similarity = sql<number>`similarity(${haystack}, ${needle})`;

  const parent = sql<string | null>`(
    select p.slug from categories p where p.id = categories.parent_id
  )`;

  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentSlug: parent,
      productCount: categoryProductCount,
      similarity,
    })
    .from(categories)
    .where(
      sql`(${haystack} like '%' || ${needle} || '%' or ${similarity} > ${SIMILARITY_THRESHOLD})`,
    )
    .orderBy(desc(similarity), asc(categories.sort))
    .limit(limit * 3);

  return rows
    .map((row) => ({
      ...row,
      productCount: Number(row.productCount),
      similarity: Number(row.similarity),
    }))
    .filter((row) => row.productCount > 0)
    .slice(0, limit);
}

/**
 * How the term matched: how many products at all, and how many literally.
 *
 * BOTH numbers in one round trip, because the notice needs both. "Showing the
 * closest results" is only true when there ARE results — printed over an empty
 * grid it is a second thing gone wrong on a screen that already went wrong
 * once. And without the exact count, fuzzy matching stays silent: the shopper
 * sees results for a word they did not type and cannot tell whether the system
 * understood them or got lucky.
 *
 * Deliberately unfiltered. It describes the TERM, not the shopper's facets — a
 * price band that empties the grid says nothing about whether the word was
 * spelled right.
 */
export async function searchTermMatchCounts(
  term: string,
): Promise<{ total: number; exact: number }> {
  const query = term.trim();
  if (!query) return { total: 0, exact: 0 };

  const needle = searchKeyForInput(query);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      exact: sql<number>`count(*) filter (where ${productSearchExact(needle)})::int`,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        productSearchMatch(needle),
      ),
    );

  return { total: Number(row?.total ?? 0), exact: Number(row?.exact ?? 0) };
}

const CORRECTION_THRESHOLD = 0.34;

/**
 * The closest thing in the catalogue's own vocabulary to what was typed.
 *
 * Trigram tolerance is otherwise INVISIBLE: a misspelling quietly returns the
 * right products and the shopper reads it as luck rather than as the system
 * understanding them. Naming the word it matched turns that into a correction
 * they can trust and, when it guessed wrong, undo in one tap.
 *
 * The vocabulary is deliberately small and closed: category names, shop names
 * and brands. Product titles are sentences, and offering one back as a spelling
 * suggestion reads as nonsense.
 */
export async function searchCorrection(term: string, locale: string): Promise<string | null> {
  const query = term.trim();
  if (query.length < 2) return null;

  const needle = searchKeyForInput(query);

  /*
   * Scored against the name IN THE READER'S LANGUAGE, not against the
   * all-locale key the matching uses. The key is "کفش shoes " — three languages
   * concatenated — and the extra trigrams halve every score against it: «کفشش»
   * scores 0.17 there and 0.50 here. Matching wants the wide net; a suggestion
   * put into somebody's mouth wants the narrow one. A suggestion in a language
   * the reader is not using would also be a dead end for them.
   */
  const name = localizedColumn(categories.name, locale);
  const shopName = localizedColumn(shops.name, locale);
  const categoryScore = sql<number>`similarity(gulbahar_search_key(${name}), ${needle})`;
  const shopScore = sql<number>`similarity(gulbahar_search_key(${shopName}), ${needle})`;

  const [categoryRow, shopRow, brandRow] = await Promise.all([
    db.select({ label: name, score: categoryScore }).from(categories).orderBy(desc(categoryScore)).limit(1),
    db
      .select({ label: shopName, score: shopScore })
      .from(shops)
      .where(eq(shops.status, 'approved'))
      .orderBy(desc(shopScore))
      .limit(1),
    db
      .select({
        label: products.brand,
        score: sql<number>`similarity(gulbahar_search_key(${products.brand}), ${needle})`,
      })
      .from(products)
      .where(and(eq(products.status, 'published'), isNotNull(products.brand)))
      .orderBy(desc(sql`similarity(gulbahar_search_key(${products.brand}), ${needle})`))
      .limit(1),
  ]);

  const best = [categoryRow[0], shopRow[0], brandRow[0]]
    .filter((row): row is { label: string; score: number } => Boolean(row?.label))
    .map((row) => ({ ...row, score: Number(row.score) }))
    .sort((a, b) => b.score - a.score)[0];

  /*
   * A HIGHER BAR than the search threshold on purpose. 0.12 is generous enough
   * to be worth searching on and far too weak to put a word in a shopper's
   * mouth — "did you mean «ورزش»?" for an unrelated query is worse than saying
   * nothing. Measured against the seed: «کفشش» → «کفش» scores 0.50 and «سامسون»
   * → «ساعت» scores 0.20, and the line falls between them. Never suggests what
   * was already typed.
   */
  if (!best || best.score < CORRECTION_THRESHOLD) return null;
  return best.label.trim().toLowerCase() === query.toLowerCase() ? null : best.label;
}

/**
 * Header type-ahead payload (PRD §5.2): top 5 products, 2 shops, 2 categories.
 *
 * Categories are in the panel for the same reason they are in the results: an
 * aisle word is one of the commonest things typed into a marketplace search,
 * and the fastest useful answer to it is the aisle.
 */
export async function searchSuggestions(term: string, locale: string) {
  const [products, shops, categories] = await Promise.all([
    searchProducts(term, { limit: 5, locale }),
    searchShops(term, { limit: 2 }),
    searchCategories(term, { limit: 2 }),
  ]);
  return { products, shops, categories };
}

/**
 * What the mall is searching for (trending).
 *
 * GROUPED ON THE NORMALISED FORM but displayed as the most common SPELLING of
 * that group — so "کفش" and "کفش " are one chip, and the chip reads the way
 * people actually type it.
 *
 * A MINIMUM COUNT, because a "trend" of one is just a person. Below it the list
 * is a log of individual curiosity rather than an aggregate, which is both less
 * useful and a small privacy leak on a quiet site.
 *
 * Scoped to the reader's LOCALE: a Dari search and an English one are different
 * strings for the same intent, and offering «بوت» to an English reader is a dead
 * end for them.
 */
export async function trendingSearches(
  locale: string,
  options: { days?: number; limit?: number; minCount?: number } = {},
) {
  const { days = 30, limit = 24, minCount = 2 } = options;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const rows = await db.execute(sql`
    select
      -- The spelling used most often for this normalised term.
      (array_agg(term order by length(term) asc))[1] as label,
      normalized,
      count(*)::int as total
    from search_queries
    where created_at >= ${since}::timestamptz
      and locale = ${locale}
    group by normalized
    having count(*) >= ${minCount}
    order by count(*) desc, normalized asc
    limit ${limit}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    label: String(row.label),
    normalized: String(row.normalized),
    total: Number(row.total),
  }));
}
