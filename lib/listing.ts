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
 * BRAND NAMES, and the one mixed-script block on a Dari listing page.
 *
 * `products.brand` stores a Latin token — "Ariana", "Samsung" — because that is
 * the key the catalogue, the importer and the URL all agree on, and a filter
 * value has to survive a round trip through a query string. But a column of
 * Latin words down the side of an otherwise Dari page is the only place the
 * reader's eye has to change direction, and half of these brands are Afghan
 * companies whose real name is written in Persian script.
 *
 * THE RULE, applied everywhere a brand is shown to a customer: render the Dari
 * name from `filters.brandNames` with the Latin token beside it in a muted,
 * `dir="ltr"` span — the token is what is printed on the box and what a shopper
 * matches against a product page. A brand with no entry falls back to its token
 * alone, so an imported brand nobody has translated yet still filters correctly
 * rather than rendering a raw message path.
 *
 * Read out of the message tree by key rather than through `t()` because the key
 * is a data value: `t('brandNames.Xiaomi')` on a brand that has no entry logs a
 * missing-message error and renders the path.
 */
export type BrandNames = Record<string, string>;

export function brandNamesFrom(messages: unknown): BrandNames {
  const names = (messages as { filters?: { brandNames?: unknown } } | null)?.filters?.brandNames;
  return names !== null && typeof names === 'object' ? (names as BrandNames) : {};
}

/** The Dari name and, when it differs, the Latin token to show beside it. */
export function brandLabel(
  value: string,
  names: BrandNames,
): { label: string; token: string | null } {
  const translated = names[value];
  return translated && translated !== value
    ? { label: translated, token: value }
    : { label: value, token: null };
}

/**
 * The size below which a catalogue does not need narrowing.
 *
 * A shop page carried the full listing apparatus — the shop's own category
 * chips, an in-shop search box, a sort control and a filter rail — above five
 * products. Four controls to narrow a set the reader can already see entire is
 * not a feature, it is furniture: it pushes the goods below the fold and it
 * asks somebody to do work whose best possible outcome is the page they are
 * already looking at.
 *
 * Eight, because that is a bit more than a full grid row at every width the
 * storefront lays out: at eight the reader can still take the whole catalogue
 * in with one scroll, and above it a filter starts being able to remove
 * something they have not already seen. In lib/ and not beside the shop page
 * because the query layer and the page both read it, and a `'use client'`
 * module cannot export a number to a server component (CLAUDE.md).
 */
export const SMALL_CATALOGUE_MAX = 8;

/**
 * Threshold for the "only N left" badge on a card (PRD §5.2).
 *
 * Three, not the dashboard's five: a shopkeeper wants warning early enough to
 * restock, a shopper only cares once it is nearly gone. A badge that fires at
 * five appears on a third of the catalogue and stops meaning anything.
 */
export const LOW_STOCK_BADGE_THRESHOLD = 3;
