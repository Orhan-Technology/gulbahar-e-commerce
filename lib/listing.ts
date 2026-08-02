/**
 * The listing vocabulary, in one place (PRD §5.1).
 *
 * Every listing surface — categories, search, offers, a shop's own page — reads
 * and writes the same query keys and offers the same sorts, so a filter means
 * the same thing everywhere and a URL can be moved between surfaces without
 * losing its state.
 *
 * IN lib/, NOT beside the components that use it, and that is load-bearing
 * twice over:
 *
 *   - The query layer needs the sort names too, and a query module importing
 *     from components/ is a layering inversion that works right up until
 *     someone reuses the query somewhere without React.
 *   - It must not be a `'use client'` module. The toolbar first read these
 *     from lib/db/queries/products.ts, which pulled `postgres` into the client
 *     bundle and took every listing page down with "Can't resolve 'fs'" — a
 *     500 whose stack names the bundler, not the import that caused it.
 */

/**
 * Listing orders, in the order they appear in the sort control.
 *
 * `popularity` leads and is the default. There is deliberately NO alphabetical
 * option: it is the one sort that is never what a shopper wants and always what
 * a listing defaults to by accident.
 */
export const PRODUCT_SORTS = [
  'popularity',
  'newest',
  'price_asc',
  'price_desc',
  'rating',
  /*
   * Biggest percentage off. It reads as an offers-page control and it is, but
   * it belongs to the shared vocabulary for the same reason every other sort
   * does: a shopper who found it there will look for it on a category page, and
   * a sort that exists on one listing and not another is the drift this file
   * exists to prevent.
   */
  'discount',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const isProductSort = (value: unknown): value is ProductSort =>
  typeof value === 'string' && (PRODUCT_SORTS as readonly string[]).includes(value);

/** Query keys that narrow a result set. Order is the order chips appear in. */
export const FILTER_KEYS = [
  'category',
  'brand',
  'shop',
  'priceMin',
  'priceMax',
  'minRating',
  'inStock',
  'onOffer',
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

/**
 * Keys that survive "clear all" — they say what you are LOOKING AT, not how it
 * is narrowed. Clearing filters on a search results page must not also throw
 * away the search term.
 */
export const PRESERVED_KEYS = ['q', 'sort'] as const;

/**
 * Quick price bands, as fractions of the catalogue's real maximum.
 *
 * Fractions rather than fixed afghani amounts: the bands have to stay useful
 * whether the catalogue tops out at 5,000 or 500,000, and hard-coded steps go
 * stale the moment a shop lists something expensive.
 */
export const PRICE_BANDS = [
  { key: 'band1', from: 0, to: 0.1 },
  { key: 'band2', from: 0.1, to: 0.3 },
  { key: 'band3', from: 0.3, to: 0.6 },
  { key: 'band4', from: 0.6, to: 1 },
] as const;

/** How many filters are currently applied — the number on the mobile badge. */
export function activeFilterCount(params: URLSearchParams): number {
  return FILTER_KEYS.filter((key) => params.has(key)).length;
}

/**
 * Threshold for the "only N left" badge on a card (PRD §5.2).
 *
 * Three, not the dashboard's five: a shopkeeper wants warning early enough to
 * restock, a shopper only cares once it is nearly gone. A badge that fires at
 * five appears on a third of the catalogue and stops meaning anything.
 */
export const LOW_STOCK_BADGE_THRESHOLD = 3;
