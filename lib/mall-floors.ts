/**
 * The floors Gulbahar Center actually has.
 *
 * A shopkeeper's floor was a free numeric input on both the profile form and
 * the registration form, which is a text box asking somebody to remember a fact
 * about a building they are standing in — and it accepted «۹». The building has
 * three trading floors, so the field is a choice between three things.
 *
 * ONE LIST, imported by both forms: two separate arrays would eventually differ,
 * and the one that differed would be the one a new tenant fills in.
 *
 * Deliberately NOT a `'use client'` module and deliberately not derived from the
 * database: a constant exported from a client module reaches a server component
 * as a reference rather than a value (CLAUDE.md), and querying `distinct floor`
 * would offer a floor only because somebody already picked it — a mall with an
 * empty third floor would stop offering the third floor.
 *
 * The LABELS are not here. `common.floorName` already renders «طبقه دوم» /
 * "Second floor" with the locale's own digits, and every surface that names a
 * floor goes through it.
 */
export const MALL_FLOORS = [1, 2, 3] as const;

export type MallFloor = (typeof MALL_FLOORS)[number];
