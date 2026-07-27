'use server';

import { z } from 'zod';

import { pickLocale } from '../db/localized';
import { searchSuggestions } from '../db/queries/search';

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
  kind: 'product' | 'shop';
  slug: string;
  label: string;
  sublabel: string;
  imagePath: string | null;
};

export async function fetchSuggestions(term: string, locale: string): Promise<Suggestion[]> {
  const parsed = schema.safeParse({ term, locale });
  if (!parsed.success) return [];

  const { products, shops } = await searchSuggestions(parsed.data.term, parsed.data.locale);

  return [
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
