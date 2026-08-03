import { desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '..';
import { verificationDocumentExists } from '../../verification-storage';
import { shopVerificationDocuments, shopVerifications, shops } from '../schema';

/**
 * Verification reads (Prompt C7).
 *
 * NOTHING HERE RETURNS A FILE PATH to a caller that renders. The path is an
 * internal detail of lib/verification-storage.ts; components receive document
 * IDs and ask the authenticated route for the bytes. A path in a client payload
 * is a path in the page source, and these are identity documents.
 *
 * They DO receive `available`, which is the path reduced to the one bit a
 * renderer is entitled to: can this be opened. Without it the review screen
 * embedded a 404 body and the reader saw an empty rectangle — indistinguishable
 * from a document that had not finished loading, and approvable either way.
 */

/**
 * The documents a verification cannot be approved without.
 *
 * A business licence says the shop is a business; a tazkira says who is behind
 * it. A unit agreement is useful and not decisive — the mall already knows who
 * holds which door — so it is not on this list. Kept beside the reads that
 * enforce it rather than in the component, because the ACTION checks the same
 * rule and a second copy would let the two drift apart (see decideVerification).
 */
export const REQUIRED_DOCUMENT_KINDS = ['business_licence', 'owner_id'] as const;

export type VerificationDocumentView = {
  id: string;
  kind: 'business_licence' | 'owner_id' | 'unit_agreement' | 'other';
  mime: string;
  size: number;
  originalName: string | null;
  /** False when the row names a file that is not on disk — see the note above. */
  available: boolean;
};

/**
 * Whether the evidence in front of the reviewer is enough to approve on.
 *
 * Two ways to fail, and they read differently to an admin, so they are reported
 * separately: a required kind was never submitted, or it was submitted and the
 * file cannot be opened. The first is the shop's omission; the second is ours.
 */
export type EvidenceState = {
  canApprove: boolean;
  /** Required kinds with no row at all. */
  missingKinds: string[];
  /** Required kinds whose file could not be read. */
  unreadableKinds: string[];
};

export function evidenceState(documents: VerificationDocumentView[]): EvidenceState {
  const missingKinds: string[] = [];
  const unreadableKinds: string[] = [];

  for (const kind of REQUIRED_DOCUMENT_KINDS) {
    const matches = documents.filter((document) => document.kind === kind);
    if (matches.length === 0) missingKinds.push(kind);
    else if (!matches.some((document) => document.available)) unreadableKinds.push(kind);
  }

  return {
    canApprove: missingKinds.length === 0 && unreadableKinds.length === 0,
    missingKinds,
    unreadableKinds,
  };
}

/**
 * Adds `available` to a set of document rows and drops the path.
 *
 * The path never leaves this module: it is read here, turned into a boolean,
 * and forgotten. Everything downstream sees the id and the bit.
 */
async function withAvailability(
  // The row as SELECTED — `available` is what this function adds, so requiring
  // it on the way in asks the caller for the answer it came here to get.
  rows: Array<Omit<VerificationDocumentView, 'available'> & { filePath: string }>,
): Promise<VerificationDocumentView[]> {
  return Promise.all(
    rows.map(async ({ filePath, ...document }) => ({
      ...document,
      available: await verificationDocumentExists(filePath),
    })),
  );
}

const documentColumns = {
  id: shopVerificationDocuments.id,
  kind: shopVerificationDocuments.kind,
  mime: shopVerificationDocuments.mime,
  size: shopVerificationDocuments.size,
  originalName: shopVerificationDocuments.originalName,
  filePath: shopVerificationDocuments.filePath,
};

export type VerificationView = {
  id: string;
  status: 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired';
  submittedAt: Date | null;
  decidedAt: Date | null;
  expiresAt: Date | null;
  reason: string | null;
  note: string | null;
  documents: VerificationDocumentView[];
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

  const documents = await withAvailability(
    await db
      .select(documentColumns)
      .from(shopVerificationDocuments)
      .where(eq(shopVerificationDocuments.verificationId, row.id)),
  );

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

  const documents = await withAvailability(
    await db
      .select(documentColumns)
      .from(shopVerificationDocuments)
      .where(eq(shopVerificationDocuments.verificationId, row.id)),
  );

  return { ...row, documents, evidence: evidenceState(documents) };
}

/**
 * Does this shop have identity papers waiting on someone? (Prompt C11.)
 *
 * The shop review screen and the verification queue were two decisions about
 * the same tenant on two pages that had never heard of each other: an admin
 * could approve a shop's registration without being told its tazkira was
 * sitting unread one nav item away, and vice versa. This is the one row each
 * screen needs to point at the other.
 *
 * Newest record only. A shop that was rejected last month and resubmitted is
 * "waiting" — the old verdict is history, not the state.
 */
export async function shopVerificationSummary(shopId: string) {
  const [row] = await db
    .select({
      id: shopVerifications.id,
      status: shopVerifications.status,
      submittedAt: shopVerifications.submittedAt,
      decidedAt: shopVerifications.decidedAt,
      expiresAt: shopVerifications.expiresAt,
      documentCount: sql<number>`(
        select count(*)::int from shop_verification_documents d
        where d.verification_id = shop_verifications.id
      )`,
    })
    .from(shopVerifications)
    .where(eq(shopVerifications.shopId, shopId))
    .orderBy(desc(shopVerifications.createdAt))
    .limit(1);

  if (!row) return null;
  return { ...row, documentCount: Number(row.documentCount) };
}
