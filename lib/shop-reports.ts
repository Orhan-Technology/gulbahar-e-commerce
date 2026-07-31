/**
 * Which reports the shopkeeper panel offers (Prompt C10).
 *
 * A module with NO `'use client'`, for the reason CLAUDE.md gives twice
 * already: the tab bar renders on the server and a constant exported from a
 * client module reaches a server component as a reference rather than a value.
 *
 * The order is the order a shopkeeper reads them in — what happened, what to
 * fix, what to restock, how fast am I, when am I busy — not alphabetical and
 * not by how hard each was to build.
 */
export const SHOP_REPORTS = ['overview', 'views', 'stock', 'responsiveness', 'timing'] as const;

export type ShopReportKey = (typeof SHOP_REPORTS)[number];

/** Anything unrecognised falls back to the overview rather than 404ing. */
export function parseShopReport(value: string | string[] | undefined): ShopReportKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return SHOP_REPORTS.includes(raw as ShopReportKey) ? (raw as ShopReportKey) : 'overview';
}

/** The four that export; the overview is a page of charts, not a table. */
export const EXPORTABLE: ShopReportKey[] = ['views', 'stock', 'responsiveness', 'timing'];
