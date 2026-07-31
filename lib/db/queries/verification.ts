import { desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '..';
import { shopVerificationDocuments, shopVerifications, shops } from '../schema';

/**
 * Verification reads (Prompt C7).
 *
 * NOTHING HERE RETURNS A FILE PATH to a caller that renders. The path is an
 * internal detail of lib/verification-storage.ts; components receive document
 * IDs and ask the authenticated route for the bytes. A path in a client payload
 * is a path in the page source, and these are identity documents.
 */

export type VerificationView = {
  id: string;
  status: 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired';
  submittedAt: Date | null;
  decidedAt: Date | null;
  expiresAt: Date | null;
  reason: string | null;
  note: string | null;
  documents: Array<{
    id: string;
    kind: 'business_licence' | 'owner_id' | 'unit_agreement' | 'other';
    mime: string;
    size: number;
    originalName: string | null;
  }>;
};

/** The shop's current verification record, or null when it has never submitted. */
export async function currentVerification(shopId: string): Promise<VerificationView | null> {
  const [row] = await db
    .select()
    .from(shopVerifications)
    .where(eq(shopVerifications.shopId, shopId))
    .orderBy(desc(shopVerifications.createdAt))
    .limit(1);

  if (!row) return null;

  const documents = await db
    .select({
      id: shopVerificationDocuments.id,
      kind: shopVerificationDocuments.kind,
      mime: shopVerificationDocuments.mime,
      size: shopVerificationDocuments.size,
      originalName: shopVerificationDocuments.originalName,
    })
    .from(shopVerificationDocuments)
    .where(eq(shopVerificationDocuments.verificationId, row.id));

  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    expiresAt: row.expiresAt,
    reason: row.reason,
    note: row.note,
    documents,
  };
}

/** The admin's review queue, newest submission first. */
export async function verificationQueue(
  status?: 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired',
) {
  return db
    .select({
      id: shopVerifications.id,
      status: shopVerifications.status,
      submittedAt: shopVerifications.submittedAt,
      decidedAt: shopVerifications.decidedAt,
      expiresAt: shopVerifications.expiresAt,
      reason: shopVerifications.reason,
      note: shopVerifications.note,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      shopUnitNumber: shops.unitNumber,
      documentCount: sql<number>`(
        select count(*)::int from shop_verification_documents d
        where d.verification_id = shop_verifications.id
      )`,
    })
    .from(shopVerifications)
    .innerJoin(shops, eq(shopVerifications.shopId, shops.id))
    .where(
      status
        ? eq(shopVerifications.status, status)
        : // The default view is work: everything still waiting on a decision.
          inArray(shopVerifications.status, ['submitted', 'under_review']),
    )
    .orderBy(desc(shopVerifications.submittedAt))
    .limit(50);
}

/** Counts for the queue's filter chips. */
export async function verificationCounts() {
  const rows = await db
    .select({ status: shopVerifications.status, total: sql<number>`count(*)::int` })
    .from(shopVerifications)
    .groupBy(shopVerifications.status);

  const map = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  return {
    waiting: (map.submitted ?? 0) + (map.under_review ?? 0),
    verified: map.verified ?? 0,
    rejected: map.rejected ?? 0,
    expired: map.expired ?? 0,
  };
}

/** One verification with its shop and documents, for the review screen. */
export async function verificationDetail(verificationId: string) {
  const [row] = await db
    .select({
      id: shopVerifications.id,
      status: shopVerifications.status,
      submittedAt: shopVerifications.submittedAt,
      decidedAt: shopVerifications.decidedAt,
      expiresAt: shopVerifications.expiresAt,
      reason: shopVerifications.reason,
      note: shopVerifications.note,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      shopUnitNumber: shops.unitNumber,
      shopPhone: shops.phone,
      shopStatus: shops.status,
    })
    .from(shopVerifications)
    .innerJoin(shops, eq(shopVerifications.shopId, shops.id))
    .where(eq(shopVerifications.id, verificationId))
    .limit(1);

  if (!row) return null;

  const documents = await db
    .select({
      id: shopVerificationDocuments.id,
      kind: shopVerificationDocuments.kind,
      mime: shopVerificationDocuments.mime,
      size: shopVerificationDocuments.size,
      originalName: shopVerificationDocuments.originalName,
    })
    .from(shopVerificationDocuments)
    .where(eq(shopVerificationDocuments.verificationId, row.id));

  return { ...row, documents };
}
