import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, type LocalizedText } from './shared';

/**
 * Admin-owned taxonomy (PRD §3.1, §7.2). Shops assign products to existing
 * categories but cannot create them. Two levels in practice
 * (Electronics > Mobile Phones), enforced by convention rather than a check.
 *
 * Names are trilingual and admin-maintained in all three languages (PRD §11).
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    /** Self-reference for the parent level; null means a top-level category. */
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('categories_slug_key').on(table.slug),
    index('categories_parent_idx').on(table.parentId, table.sort),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
