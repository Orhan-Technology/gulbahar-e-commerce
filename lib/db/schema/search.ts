import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, localeEnum } from './shared';

/**
 * What people searched for, in aggregate.
 *
 * NO USER COLUMN, deliberately. The only thing this table exists to answer is
 * "what is the mall searching for this week", which is a count — and a search
 * log tied to accounts is a record of what each person was curious about,
 * which is a different and much more sensitive object. The reader's OWN recent
 * searches never come here either: they live in their browser
 * (components/shop/search/recent-searches.ts), so they are theirs to clear and
 * they never leave the device.
 *
 * `term` is what was typed, kept for display; `normalized` is what the grouping
 * happens on, so "کفش " and "کفش" are one trend rather than two. The most
 * common spelling of a normalised group is what the chip shows.
 *
 * `locale` is recorded because a Dari search and an English one are different
 * strings for the same intent, and showing «بوت» to an English reader as a
 * suggested search is a dead end for them.
 */
export const searchQueries = pgTable(
  'search_queries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Exactly what the person typed, trimmed. */
    term: text('term').notNull(),
    /** Lowercased and space-collapsed — the grouping key. */
    normalized: text('normalized').notNull(),
    locale: localeEnum('locale').notNull().default('fa'),
    createdAt: createdAt(),
  },
  (table) => [
    // Trending reads a window and groups: the date leads because it is the
    // selective column, exactly as on product_view_days.
    index('search_queries_created_idx').on(table.createdAt),
    index('search_queries_normalized_idx').on(table.normalized),
  ],
);

export type SearchQuery = typeof searchQueries.$inferSelect;
