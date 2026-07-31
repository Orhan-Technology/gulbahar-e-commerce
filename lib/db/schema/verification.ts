import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, timestampCol, verificationDocumentKindEnum, verificationStatusEnum } from './shared';
import { shops } from './shops';
import { users } from './users';

/**
 * Shop verification (Prompt C7) — DISTINCT from approval.
 *
 * Approval decides whether a shop may list at all. Verification confirms the
 * business is documented. A shop can be approved and unverified for months, and
 * that is the normal starting state — conflating the two would mean either
 * blocking trade on paperwork or handing out a trust badge for signing up.
 *
 * WHAT THE BADGE CLAIMS, in the words the tooltip uses: "Mall management has
 * confirmed this is a registered business operating at this unit in Gulbahar
 * Center." That is a claim only a mall can make. A self-service marketplace can
 * verify an email; a landlord can verify that the shop is behind the door it
 * says it is.
 *
 * `expiresAt` is set a year out on approval. A verification that never expires
 * is a claim about the past dressed as a claim about the present.
 */
export const shopVerifications = pgTable(
  'shop_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    status: verificationStatusEnum('status').notNull().default('submitted'),
    submittedAt: timestampCol('submitted_at'),
    decidedAt: timestampCol('decided_at'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    /** Written by the admin on rejection, and shown to the shop verbatim. */
    reason: text('reason'),
    expiresAt: timestampCol('expires_at'),
    /** The shop's own note to the reviewer. */
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [
    index('shop_verifications_shop_idx').on(table.shopId, table.status),
    index('shop_verifications_status_idx').on(table.status, table.submittedAt),
  ],
);

/**
 * The papers themselves.
 *
 * `filePath` points OUTSIDE the served tree — see lib/verification-storage.ts.
 * These are identity documents; a path under /public would make them a URL, and
 * a URL is a thing that gets shared, indexed and cached.
 */
export const shopVerificationDocuments = pgTable(
  'shop_verification_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    verificationId: uuid('verification_id')
      .notNull()
      .references(() => shopVerifications.id, { onDelete: 'cascade' }),
    kind: verificationDocumentKindEnum('kind').notNull(),
    /** Relative to the private storage root, never a public URL. */
    filePath: text('file_path').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    originalName: text('original_name'),
    uploadedAt: createdAt(),
  },
  (table) => [index('shop_verification_documents_verification_idx').on(table.verificationId)],
);

export type ShopVerification = typeof shopVerifications.$inferSelect;
export type NewShopVerification = typeof shopVerifications.$inferInsert;
export type ShopVerificationDocument = typeof shopVerificationDocuments.$inferSelect;
