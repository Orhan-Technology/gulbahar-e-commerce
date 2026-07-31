'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { recordAdminAction } from '../audit';
import { pickLocale } from '../db/localized';
import {
  shopMembers,
  shopVerificationDocuments,
  shopVerifications,
  shops,
  type VerificationDocumentKind,
} from '../db/schema';
import { notify } from '../notify';
import {
  MAX_DOCUMENT_BYTES,
  isAllowedDocumentMime,
  storeVerificationDocument,
} from '../verification-storage';

/**
 * Shop verification writes (Prompt C7).
 *
 * Two sides, and the split matters: a shop SUBMITS, an admin DECIDES. Nothing
 * here lets a shop mark itself verified, and nothing lets an admin edit the
 * documents — the same shape as review moderation, where admin decides
 * visibility and never wording (PRD §3.1).
 */

export type VerificationResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId || user.role !== 'shopkeeper') return null;
  return { userId: user.id, shopId: user.shopId };
}

const DOCUMENT_KINDS: VerificationDocumentKind[] = [
  'business_licence',
  'owner_id',
  'unit_agreement',
  'other',
];

/**
 * Submits documents for review.
 *
 * MULTIPART, and the file parts must arrive BEFORE the root argument — see
 * scripts/lib/action-client.ts. The FormData carries `kind_<n>` beside each
 * `file_<n>` so a document's type travels with it rather than by index, which
 * would silently mislabel everything if one upload failed.
 *
 * Submitting LOCKS the set: a shop cannot swap a licence after an admin has
 * started reading it. Rejection unlocks it by creating a new record, which is
 * also what keeps the history — the rejected one stays, with its reason.
 */
export async function submitVerification(formData: FormData): Promise<VerificationResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const note = String(formData.get('note') ?? '').trim().slice(0, 500);

  const files: Array<{ kind: VerificationDocumentKind; file: File }> = [];
  for (const [key, value] of formData.entries()) {
    const match = /^file_(\d+)$/.exec(key);
    if (!match || !(value instanceof File) || value.size === 0) continue;

    const kind = String(formData.get(`kind_${match[1]}`) ?? 'other');
    files.push({
      kind: DOCUMENT_KINDS.includes(kind as VerificationDocumentKind)
        ? (kind as VerificationDocumentKind)
        : 'other',
      file: value,
    });
  }

  if (files.length === 0) return { ok: false, error: 'no_documents' };
  if (files.length > 6) return { ok: false, error: 'too_many_documents' };

  for (const entry of files) {
    if (!isAllowedDocumentMime(entry.file.type)) return { ok: false, error: 'unsupported_type' };
    if (entry.file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: 'too_large' };
  }

  // An existing submission still under review blocks a second one: two open
  // records for one shop is a queue that contradicts itself.
  const [open] = await db
    .select({ id: shopVerifications.id })
    .from(shopVerifications)
    .where(
      and(
        eq(shopVerifications.shopId, context.shopId),
        eq(shopVerifications.status, 'submitted'),
      ),
    )
    .limit(1);

  if (open) return { ok: false, error: 'already_submitted' };

  const [created] = await db
    .insert(shopVerifications)
    .values({
      shopId: context.shopId,
      status: 'submitted',
      submittedAt: new Date(),
      note: note || null,
    })
    .returning({ id: shopVerifications.id });

  for (const entry of files) {
    const bytes = Buffer.from(await entry.file.arrayBuffer());
    const filePath = await storeVerificationDocument(context.shopId, bytes, entry.file.type);

    await db.insert(shopVerificationDocuments).values({
      verificationId: created.id,
      kind: entry.kind,
      filePath,
      mime: entry.file.type,
      size: entry.file.size,
      // Kept for the admin's list, never used to build a path.
      originalName: entry.file.name.slice(0, 120),
    });
  }

  /*
   * The notification says a shop submitted documents and NOTHING about what
   * they are. The demo notification log is a presenter tool shown on a screen
   * in a room; a filename there would be the one place these documents leak.
   */
  await notify({
    eventKey: 'verification.submitted',
    channel: 'inapp',
    recipientUserId: null,
    recipientRole: 'admin',
    locale: 'fa',
    values: { shopName: await shopNameFor(context.shopId) },
  });

  revalidatePath('/dashboard/settings/verification');
  revalidatePath('/admin/verifications');
  revalidatePath('/admin');
  return { ok: true };
}

const decisionSchema = z.object({
  verificationId: z.string().uuid(),
  decision: z.enum(['verified', 'rejected']),
  reason: z.string().trim().max(400).optional(),
});

/** A year. A verification that never expires is a claim about the past. */
const VALID_FOR_DAYS = 365;

export async function decideVerification(
  input: z.input<typeof decisionSchema>,
): Promise<VerificationResult> {
  const user = await currentUser();
  if (!user?.id || user.role !== 'admin') return { ok: false, error: 'forbidden' };

  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const { verificationId, decision, reason } = parsed.data;
  // A rejection a shop cannot act on is a dead end; ten characters is one
  // sentence saying which document was wrong.
  if (decision === 'rejected' && (reason ?? '').length < 10) {
    return { ok: false, error: 'reason_required' };
  }

  const [record] = await db
    .select({ id: shopVerifications.id, shopId: shopVerifications.shopId, status: shopVerifications.status })
    .from(shopVerifications)
    .where(eq(shopVerifications.id, verificationId))
    .limit(1);

  if (!record) return { ok: false, error: 'not_found' };
  if (record.status === 'verified' || record.status === 'rejected') {
    return { ok: false, error: 'already_decided' };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + VALID_FOR_DAYS * 86_400_000);

  await db.transaction(async (tx) => {
    await tx
      .update(shopVerifications)
      .set({
        status: decision,
        decidedAt: now,
        decidedBy: user.id,
        reason: decision === 'rejected' ? (reason ?? null) : null,
        expiresAt: decision === 'verified' ? expiresAt : null,
      })
      .where(eq(shopVerifications.id, verificationId));

    /*
     * The denormalised badge field on the shop. Set on approval, CLEARED on
     * rejection — a shop that was verified last year and fails this year's
     * review must stop wearing the badge the same second.
     */
    await tx
      .update(shops)
      .set({ verifiedAt: decision === 'verified' ? now : null })
      .where(eq(shops.id, record.shopId));
  });

  const [owner] = await db
    .select({ userId: shopMembers.userId })
    .from(shopMembers)
    .where(and(eq(shopMembers.shopId, record.shopId), eq(shopMembers.role, 'owner')))
    .limit(1);

  await notify({
    eventKey: decision === 'verified' ? 'verification.approved' : 'verification.rejected',
    channel: 'inapp',
    recipientUserId: owner?.userId ?? null,
    recipientRole: 'shopkeeper',
    locale: 'fa',
    values: { reason: reason ?? '' },
  });

  await recordAdminAction({
    actorId: user.id,
    actorName: user.name?.trim() || user.phone,
    action: decision === 'verified' ? 'verification.verify' : 'verification.reject',
    targetType: 'shop',
    targetId: record.shopId,
    targetLabel: await shopNameFor(record.shopId),
    reason: reason ?? null,
    detail: { expiresAt: decision === 'verified' ? expiresAt.toISOString() : null },
  });

  revalidatePath('/admin/verifications');
  revalidatePath('/admin');
  revalidatePath('/dashboard/settings/verification');
  revalidatePath('/shops');
  return { ok: true };
}

/** Marks a submission as being read, so two admins do not review it twice. */
export async function claimVerification(verificationId: string): Promise<VerificationResult> {
  const user = await currentUser();
  if (!user?.id || user.role !== 'admin') return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(verificationId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [claimed] = await db
    .update(shopVerifications)
    .set({ status: 'under_review' })
    .where(
      and(eq(shopVerifications.id, parsed.data), eq(shopVerifications.status, 'submitted')),
    )
    .returning({ shopId: shopVerifications.shopId });

  // Only when it actually moved: claiming an already-claimed submission is a
  // no-op, and logging it would fill the audit page with nothing happening.
  if (claimed) {
    await recordAdminAction({
      actorId: user.id,
      actorName: user.name?.trim() || user.phone,
      action: 'verification.claim',
      targetType: 'shop',
      targetId: claimed.shopId,
      targetLabel: await shopNameFor(claimed.shopId),
    });
  }

  revalidatePath('/admin/verifications');
  return { ok: true };
}

async function shopNameFor(shopId: string): Promise<string> {
  const [shop] = await db
    .select({ name: shops.name })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);
  return shop ? pickLocale(shop.name, 'fa') : '';
}
