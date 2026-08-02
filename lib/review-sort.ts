/**
 * The order a product's reviews are read in, and the star filter beside it.
 *
 * A PLAIN MODULE with no `'use client'`, because both sides need these values:
 * the server query builds an ORDER BY from the key, and the client control that
 * writes it into the URL renders the same list of options. A constant exported
 * from a `'use client'` module reaches a server component as a client reference
 * rather than a value (CLAUDE.md), so the shared vocabulary has to live here.
 *
 * `recent` is the DEFAULT and is therefore never written to the URL — selecting
 * it clears the key, the same rule the listing toolbar follows, so the canonical
 * address of a product page stays free of parameters nobody chose.
 */

export const REVIEW_SORTS = ['recent', 'helpful', 'highest', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const DEFAULT_REVIEW_SORT: ReviewSort = 'recent';

/** URL keys, in one place so the server page and the client control agree. */
export const REVIEW_SORT_PARAM = 'reviewSort';
export const REVIEW_STARS_PARAM = 'reviewStars';
export const REVIEW_PAGE_PARAM = 'reviewPage';

/** Anything unrecognised falls back to the default rather than 404ing. */
export function parseReviewSort(value: string | string[] | undefined): ReviewSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return REVIEW_SORTS.includes(raw as ReviewSort) ? (raw as ReviewSort) : DEFAULT_REVIEW_SORT;
}

/**
 * The star filter, or null for "all".
 *
 * Null rather than 0 for the unfiltered case: a filter on zero stars would be a
 * filter that can never match, and the two states have to be distinguishable in
 * the query as well as in the chip above the list.
 */
export function parseReviewStars(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

export function parseReviewPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? 1);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

/**
 * The reviews section's own query string, built from scratch each time.
 *
 * Every link in the block — a histogram bar, the clear affordance, a page
 * number — goes through here, so none of them can drop one of the other two
 * parameters. Defaults are omitted, and changing the filter or the order always
 * returns to page one: page four of "five-star reviews" is not page four of
 * "all reviews", and carrying the number across lands the reader on an empty
 * list.
 */
export function reviewQuery(options: {
  stars?: number | null;
  sort?: ReviewSort;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (options.stars) params.set(REVIEW_STARS_PARAM, String(options.stars));
  if (options.sort && options.sort !== DEFAULT_REVIEW_SORT) {
    params.set(REVIEW_SORT_PARAM, options.sort);
  }
  if (options.page && options.page > 1) params.set(REVIEW_PAGE_PARAM, String(options.page));
  return params.toString();
}

/** `/products/slug#reviews`, with the section's parameters and the anchor. */
export function reviewHref(
  productSlug: string,
  options: { stars?: number | null; sort?: ReviewSort; page?: number },
): string {
  const query = reviewQuery(options);
  return `/products/${productSlug}${query ? `?${query}` : ''}#reviews`;
}
