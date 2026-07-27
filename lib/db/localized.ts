import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { AppLocale } from '@/lib/i18n/routing';
import type { LocalizedText } from './schema/shared';

/**
 * Fallback chain from PRD §11: ps → fa and en → fa. Dari also falls through to
 * the other languages rather than rendering an empty string, because a blank
 * product title is worse than one in the wrong language.
 */
const FALLBACK: Record<AppLocale, readonly AppLocale[]> = {
  fa: ['fa', 'en', 'ps'],
  en: ['en', 'fa', 'ps'],
  ps: ['ps', 'fa', 'en'],
};

function chain(locale: string): readonly AppLocale[] {
  return FALLBACK[locale as AppLocale] ?? FALLBACK.fa;
}

/**
 * Resolves a localized JSONB field to a single string for the active locale.
 * Used everywhere content is rendered — never read `field.fa` directly.
 */
export function pickLocale(field: LocalizedText | null | undefined, locale: string): string {
  if (!field) return '';
  for (const key of chain(locale)) {
    const value = field[key];
    if (value) return value;
  }
  return '';
}

/**
 * True when the field has real content in `locale` rather than falling back.
 * Drives the dashboard's "missing translation" chip (PRD §11, §6.2).
 */
export function hasTranslation(field: LocalizedText | null | undefined, locale: string): boolean {
  return Boolean(field?.[locale as AppLocale]);
}

/**
 * Which locales are still missing on a field, for the shopkeeper's product form.
 */
export function missingLocales(
  field: LocalizedText | null | undefined,
  locales: readonly AppLocale[],
): AppLocale[] {
  return locales.filter((locale) => !field?.[locale]);
}

/* ---------------------------------------------------------------------------
 * SQL-side equivalents.
 *
 * Sorting and searching have to happen in Postgres, so the fallback chain needs
 * a SQL form too. Keeping both in this file means the two can never drift.
 * ------------------------------------------------------------------------- */

/**
 * COALESCE over the fallback chain, e.g. for ORDER BY on a translated title.
 */
export function localizedColumn(column: PgColumn, locale: string): SQL<string> {
  const [first, second, third] = chain(locale);
  return sql<string>`coalesce(
    nullif(${column}->>${first}, ''),
    nullif(${column}->>${second}, ''),
    nullif(${column}->>${third}, ''),
    ''
  )`;
}

/**
 * Every locale value concatenated, for trigram matching.
 *
 * Search deliberately spans all locales rather than just the active one: a Kabul
 * customer typing "Samsung" in the Dari UI should still find a product whose
 * Dari title is «سامسونگ گلکسی» and whose English title carries the Latin name
 * (PRD §12.3).
 *
 * MUST stay textually identical to the index expressions in lib/db/sql/search.sql
 * — if the two drift, the GIN indexes are silently ignored. `||` with coalesce
 * rather than concat_ws, because concat_ws is STABLE and cannot be indexed.
 */
export function searchableColumn(column: PgColumn): SQL<string> {
  return sql<string>`coalesce(${column}->>'fa', '') || ' ' || coalesce(${column}->>'en', '') || ' ' || coalesce(${column}->>'ps', '')`;
}

/**
 * The normalized, index-backed search key for a localized column. Wraps
 * searchableColumn in the same gulbahar_search_key() the indexes are built on.
 */
export function searchKey(column: PgColumn): SQL<string> {
  return sql<string>`gulbahar_search_key(${searchableColumn(column)})`;
}

/** Normalizes a user-typed query the same way stored values are normalized. */
export function searchKeyForInput(term: string): SQL<string> {
  return sql<string>`gulbahar_search_key(${term})`;
}
