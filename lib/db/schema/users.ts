import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, localeEnum, timestampCol, userRoleEnum } from './shared';

/**
 * Phone-number identity (PRD §5.7, §14). There is no password — sign-in is
 * phone + OTP, and the OTP is delivered to the on-screen notification log in
 * the demo build.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    name: text('name').notNull(),
    role: userRoleEnum('role').notNull().default('customer'),
    locale: localeEnum('locale').notNull().default('fa'),
    /** Admin can deactivate accounts (PRD §7.5) without deleting history. */
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('users_phone_key').on(table.phone),
    index('users_role_idx').on(table.role),
  ],
);

/**
 * Saved delivery addresses. Kabul districts are a free-text/select pair rather
 * than a geocoded address — there is no mapping provider in the demo (PRD §12.4).
 */
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    district: text('district').notNull(),
    streetDetails: text('street_details').notNull(),
    phone: text('phone').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('addresses_user_idx').on(table.userId)],
);

/**
 * Short-lived OTP codes.
 *
 * Not in the PRD §14 outline, but requestOtp/verifyOtp (PRD §12.2, Prompt 3.2)
 * need somewhere to hold a hashed code with an expiry. Kept in its own table
 * rather than on `users` so repeated attempts and expiry are cheap to reason
 * about, and so nothing sensitive sits on the identity row.
 */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    /** SHA-256 of the 6-digit code — never the code itself. */
    codeHash: text('code_hash').notNull(),
    expiresAt: timestampCol('expires_at').notNull(),
    consumedAt: timestampCol('consumed_at'),
    /** Failed verification count, so a code can be burned after a few tries. */
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('otp_codes_phone_idx').on(table.phone, table.expiresAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type OtpCode = typeof otpCodes.$inferSelect;
