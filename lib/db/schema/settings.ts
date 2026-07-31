import { check, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { localeEnum, updatedAt, type DbLocale, type LocalizedText } from './shared';

/**
 * The mall's own facts, editable by the admin (Prompt A4).
 *
 * These used to be three different kinds of hard-coded: `DELIVERY_FEE` and
 * `FREE_DELIVERY_THRESHOLD` as constants in lib/offers.ts, the address, hours
 * and support number as fa/en message strings, and the currency label as
 * whatever `Intl` decided. That is fine until the client asks to see their own
 * mall in the demo — at which point "we would change that in the code" is the
 * wrong answer, and every one of those values is a thing a mall manager
 * genuinely owns.
 *
 * ONE ROW, enforced by a check constraint rather than by convention: a second
 * row would silently become a second marketplace, and whichever one the query
 * happened to return first would win. `id` is fixed at 1 for the same reason —
 * the row is addressed by a constant, never looked up.
 *
 * `hours` is stored canonically as ASCII `HH:MM-HH:MM` and localised by
 * `formatOpeningHours()`, exactly as `shops.hours` is (CLAUDE.md). Storing the
 * display string freezes one language's digits into the column, which the first
 * shop seed did and left English visitors reading Persian numerals.
 */
export const platformSettings = pgTable(
  'platform_settings',
  {
    id: integer('id').primaryKey().default(1),
    mallName: jsonb('mall_name').$type<LocalizedText>().notNull(),
    address: jsonb('address').$type<LocalizedText>().notNull(),
    /** ASCII `HH:MM-HH:MM`, never a display string. */
    hours: text('hours').notNull(),
    supportPhone: text('support_phone').notNull(),
    /** Integer afghanis, like every other money column (CLAUDE.md). */
    deliveryFee: integer('delivery_fee').notNull(),
    freeDeliveryThreshold: integer('free_delivery_threshold').notNull(),
    /**
     * How long a shop holds a reserve-and-collect order (Prompt C11).
     *
     * Settings rather than a constant because it is a MALL POLICY, not a
     * technical limit: a mall that fills its units may want twenty-four hours,
     * and the client should be able to say so on screen rather than in a
     * ticket. Hours, not days — "48 hours" is what the shopkeeper tells the
     * customer, and expressing it in days would round away the answer.
     */
    pickupHoldHours: integer('pickup_hold_hours').notNull().default(48),
    /** What the storefront calls the currency, e.g. "افغانی" / "AFN". */
    currencyLabel: jsonb('currency_label').$type<LocalizedText>().notNull(),
    defaultLocale: localeEnum('default_locale').notNull().default('fa'),
    /** Which locales the language switcher offers. Pashto ships as structure only. */
    publishedLocales: jsonb('published_locales').$type<DbLocale[]>().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [check('platform_settings_singleton', sql`${table.id} = 1`)],
);

export type PlatformSettings = typeof platformSettings.$inferSelect;
export type NewPlatformSettings = typeof platformSettings.$inferInsert;
