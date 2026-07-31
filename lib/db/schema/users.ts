import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, localeEnum, timestampCol, userRoleEnum } from './shared';

/**
 * Phone-number identity (PRD §5.7, §14; Prompt A1). The phone IS the account:
 * every user has exactly one, set at registration and never editable, and it
 * stays the recovery path and the OTP target regardless of what else is added.
 *
 * Email + password are an OPTIONAL second credential, attached to the account
 * the phone created rather than a second identity — there is no email-only
 * registration path. Both columns are nullable for exactly that reason: most
 * seeded accounts never set either. `emailVerifiedAt` gates sign-in, not
 * `email` alone, so an entered-but-unconfirmed address can never be used to
 * get in. Passwords are never stored in plaintext, logged, or written to the
 * demo notification log — only `passwordHash` (argon2) and the timestamp of
 * its last change, which the account UI surfaces as "updated {date}".
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
    /** Lowercased and trimmed on write — see lib/auth/email.ts. */
    email: text('email'),
    emailVerifiedAt: timestampCol('email_verified_at'),
    passwordHash: text('password_hash'),
    passwordUpdatedAt: timestampCol('password_updated_at'),
    /**
     * Which notification categories this person wants (Prompt C12).
     *
     * ABSENT MEANS EVERYTHING ON, which is why this is nullable and sparse: a
     * row only ever records the categories somebody has turned OFF. Seeding a
     * full object for every user would mean a new category defaults to
     * "muted" for existing accounts and to "on" for new ones — the same
     * feature behaving differently depending on when you signed up.
     */
    notificationPrefs: jsonb('notification_prefs').$type<Record<string, boolean>>(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('users_phone_key').on(table.phone),
    index('users_role_idx').on(table.role),
    uniqueIndex('users_email_key').on(table.email),
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

/**
 * Short-lived email verification codes (Prompt A1) — the same shape as
 * `otpCodes` above, one row per attempt to add or reverify an email, keyed to
 * the account rather than to a bare address: the code proves "this user
 * controls this inbox", not "this inbox exists", so a code issued to one
 * account can never verify a different one that later claims the same email.
 */
export const emailVerificationCodes = pgTable(
  'email_verification_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    /** SHA-256 of the 6-digit code — never the code itself. */
    codeHash: text('code_hash').notNull(),
    expiresAt: timestampCol('expires_at').notNull(),
    consumedAt: timestampCol('consumed_at'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('email_verification_codes_user_idx').on(table.userId, table.expiresAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type OtpCode = typeof otpCodes.$inferSelect;
export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;
