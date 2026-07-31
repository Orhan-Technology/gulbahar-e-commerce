import { and, eq } from 'drizzle-orm';

import { currentUser } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { shopMembers, shopVerificationDocuments, shopVerifications } from '@/lib/db/schema';
import { readVerificationDocument } from '@/lib/verification-storage';

/**
 * Streams a verification document to someone entitled to see it (Prompt C7).
 *
 * ONE OF THE FEW ROUTE HANDLERS IN THIS PRODUCT, and it earns the exception
 * CLAUDE.md allows: a server component can render a document, but it cannot
 * RETURN one — a private file needs a response with its own content type, and
 * that is what a route handler is for.
 *
 * DENY BY DEFAULT, and 404 rather than 403 for everyone who is not entitled.
 * A 403 confirms the document exists, which is a fact about a business's
 * paperwork that a competitor two floors down should not be able to establish
 * by guessing ids. Not found is the honest answer to "does this exist" when the
 * asker has no right to know.
 *
 * Entitlement is exactly two things: an admin, or a member of the shop the
 * document belongs to. It is checked against the ROW rather than a shopId
 * carried in the session, so a stale session from a shop someone has left
 * cannot open its papers.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  const user = await currentUser();
  if (!user?.id) return notFound();

  const [document] = await db
    .select({
      filePath: shopVerificationDocuments.filePath,
      mime: shopVerificationDocuments.mime,
      shopId: shopVerifications.shopId,
    })
    .from(shopVerificationDocuments)
    .innerJoin(
      shopVerifications,
      eq(shopVerificationDocuments.verificationId, shopVerifications.id),
    )
    .where(eq(shopVerificationDocuments.id, documentId))
    .limit(1);

  if (!document) return notFound();

  if (user.role !== 'admin') {
    const [membership] = await db
      .select({ userId: shopMembers.userId })
      .from(shopMembers)
      .where(and(eq(shopMembers.shopId, document.shopId), eq(shopMembers.userId, user.id)))
      .limit(1);

    if (!membership) return notFound();
  }

  const bytes = await readVerificationDocument(document.filePath);
  if (!bytes) return notFound();

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': document.mime,
      /*
       * `inline` so the admin can read it in the review screen without a
       * download, and `no-store` because a private document has no business in
       * a shared cache — or in the browser's, on a shop's counter machine.
       */
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** The same answer for "does not exist" and "not yours" — see the note above. */
function notFound(): Response {
  return new Response('Not found', { status: 404 });
}
