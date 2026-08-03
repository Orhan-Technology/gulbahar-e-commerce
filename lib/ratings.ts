/**
 * How much evidence a star rating needs before it is worth showing.
 *
 * A card carrying one review renders five outline stars and a "1" beside them,
 * and at card size that reads as *emptiness* rather than as a score — a grid of
 * young products looks like a grid of bad ones. Below the threshold the row is
 * left blank instead: an unrated product is not a rated-badly product, and
 * saying nothing is the honest version of saying nothing.
 *
 * PLAIN MODULE, no `'use client'`. A constant exported from a client module
 * arrives at a server component as a client reference and reads as `undefined`,
 * which is the silent-wrong-number failure CLAUDE.md records — the card, the
 * comparison table and the grids that use this span both sides of the boundary.
 */
export const MIN_RATING_REVIEWS = 3;

/** True when the review count is enough to display a star rating. */
export function hasRatingEvidence(count: number | undefined | null): boolean {
  return (count ?? 0) >= MIN_RATING_REVIEWS;
}
