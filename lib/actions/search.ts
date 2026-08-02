'use server';

import { z } from 'zod';

import { db } from '../db';
import { pickLocale } from '../db/localized';
import { searchSuggestions, trendingSearches } from '../db/queries/search';
import { searchQueries } from '../db/schema';
import { MAX_SEARCH_TERM, normalizeSearchTerm } from '../search-terms';

/**
 * Type-ahead suggestions for the header (PRD §5.2): top 5 products plus 2 shops.
 *
 * A server action rather than an API route, per CLAUDE.md — nothing here needs an
 * HTTP endpoint. Localised strings are resolved server-side so the client payload
 * stays small and the client never needs the locale-fallback logic.
 */
const schema = z.object({
  term: z.string().trim().min(1).max(80),
  locale: z.string().min(2).max(5),
});

export type Suggestion = {
  kind: 'product' | 'shop' | 'category';
  slug: string;
  label: string;
  sublabel: string;
  imagePath: string | null;
};

export async function fetchSuggestions(term: string, locale: string): Promise<Suggestion[]> {
  const parsed = schema.safeParse({ term, locale });
  if (!parsed.success) return [];

  const { products, shops, categories } = await searchSuggestions(
    parsed.data.term,
    parsed.data.locale,
  );

  return [
    /*
     * CATEGORIES FIRST, and only ever two. An aisle word is the commonest thing
     * typed into a marketplace search and the aisle is the fastest correct
     * answer to it — but it is also the least specific one, so it never gets
     * more than the top of the list.
     */
    ...categories.map((category): Suggestion => ({
      kind: 'category',
      slug: category.slug,
      label: pickLocale(category.name, parsed.data.locale),
      sublabel: '',
      imagePath: null,
    })),
    ...products.map((product): Suggestion => ({
      kind: 'product',
      slug: product.slug,
      label: pickLocale(product.title, parsed.data.locale),
      sublabel: pickLocale(product.shopName, parsed.data.locale),
      imagePath: product.imagePath,
    })),
    ...shops.map((shop): Suggestion => ({
      kind: 'shop',
      slug: shop.slug,
      label: pickLocale(shop.name, parsed.data.locale),
      sublabel: shop.categoryName ? pickLocale(shop.categoryName, parsed.data.locale) : '',
      imagePath: shop.logoPath,
    })),
  ];
}

/**
 * Records a search, and returns the trending list.
 *
 * ONE ROUND TRIP for both, because they always happen together: the panel opens,
 * the reader searches, and the next time it opens the chips should already
 * reflect it. Two actions would mean two waterfalls for one interaction.
 *
 * Called when a search is SUBMITTED, never on keystroke — a log of every
 * prefix somebody typed would make "کفش" outrank the thing they were actually
 * looking for, and would record hesitation rather than intent.
 */
const logSchema = z.object({
  term: z.string().trim().min(2).max(MAX_SEARCH_TERM),
  locale: z.enum(['fa', 'en', 'ps']),
});

export async function recordSearch(term: string, locale: string): Promise<void> {
  const parsed = logSchema.safeParse({ term, locale });
  if (!parsed.success) return;

  try {
    await db.insert(searchQueries).values({
      term: parsed.data.term,
      normalized: normalizeSearchTerm(parsed.data.term),
      locale: parsed.data.locale,
    });
  } catch (error) {
    // A search that succeeded must not fail because its analytics row did.
    console.error('[search] failed to record', error);
  }
}

export type TrendingTerm = { label: string; total: number };

export async function fetchTrending(locale: string): Promise<TrendingTerm[]> {
  const parsed = z.enum(['fa', 'en', 'ps']).safeParse(locale);
  if (!parsed.success) return [];

  const rows = await trendingSearches(parsed.data);
  return rows.map((row) => ({ label: row.label, total: row.total }));
}
