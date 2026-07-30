'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import { productAnswers, productQuestions, products, shopMembers } from '../db/schema';
import { notify } from '../notify';

/**
 * Product Q&A writes (Prompt P4).
 *
 * Asking needs a signed-in account but NOT a purchase — a question comes from
 * someone deciding whether to buy, and gating it on having bought would empty
 * the section of exactly the people it exists for. Reviews are the opposite and
 * stay gated (PRD §5.5).
 *
 * Answering is the SHOP'S right, and the check is `shop_members`, not the
 * product's owner field: a staff member answers on behalf of the shop they
 * belong to. An admin may also answer, because an unanswered question on a
 * demo floor is worse than an admin-signed one — and the answer records who
 * wrote it either way.
 */

export type QuestionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const askSchema = z.object({
  productSlug: z.string().min(1),
  body: z.string().trim().min(10, { message: 'too_short' }).max(500),
});

export async function askQuestion(
  input: z.input<typeof askSchema>,
): Promise<QuestionResult<{ id: string }>> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }

  const [product] = await db
    .select({ id: products.id, shopId: products.shopId, title: products.title, slug: products.slug })
    .from(products)
    .where(and(eq(products.slug, parsed.data.productSlug), eq(products.status, 'published')))
    .limit(1);

  if (!product) return { ok: false, error: 'unknown_product' };

  const [created] = await db
    .insert(productQuestions)
    .values({
      productId: product.id,
      shopId: product.shopId,
      userId: user.id,
      body: parsed.data.body,
    })
    .returning({ id: productQuestions.id });

  // The shop hears about it immediately — this is what turns the dashboard's
  // action queue into a live workspace during the walkthrough.
  const [owner] = await db
    .select({ userId: shopMembers.userId })
    .from(shopMembers)
    .where(and(eq(shopMembers.shopId, product.shopId), eq(shopMembers.role, 'owner')))
    .limit(1);

  await notify({
    eventKey: 'question.asked',
    channel: 'inapp',
    recipientUserId: owner?.userId ?? null,
    recipientRole: 'shopkeeper',
    locale: 'fa',
    values: { productTitle: pickLocale(product.title, 'fa') },
  });

  revalidatePath(`/products/${product.slug}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/questions');
  return { ok: true, data: { id: created.id } };
}

const answerSchema = z.object({
  questionId: z.string().uuid(),
  body: z.string().trim().min(2, { message: 'too_short' }).max(1000),
});

export async function answerQuestion(
  input: z.input<typeof answerSchema>,
): Promise<QuestionResult> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, error: 'requires_auth' };

  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }

  const [question] = await db
    .select({
      id: productQuestions.id,
      shopId: productQuestions.shopId,
      userId: productQuestions.userId,
      status: productQuestions.status,
      productSlug: products.slug,
      productTitle: products.title,
    })
    .from(productQuestions)
    .innerJoin(products, eq(productQuestions.productId, products.id))
    .where(eq(productQuestions.id, parsed.data.questionId))
    .limit(1);

  if (!question) return { ok: false, error: 'not_found' };

  // Membership of the owning shop, or admin. Checked against the row, not
  // against a shopId carried in the session, so a stale session cannot answer
  // for a shop the user has left.
  if (user.role !== 'admin') {
    const [membership] = await db
      .select({ userId: shopMembers.userId })
      .from(shopMembers)
      .where(and(eq(shopMembers.shopId, question.shopId), eq(shopMembers.userId, user.id)))
      .limit(1);

    if (!membership) return { ok: false, error: 'forbidden' };
  }

  if (question.status === 'hidden') return { ok: false, error: 'hidden' };

  await db.transaction(async (tx) => {
    // Replaced wholesale rather than appended: a shop correcting its answer is
    // the common case, and two answers under one question reads as an argument.
    await tx.delete(productAnswers).where(eq(productAnswers.questionId, question.id));
    await tx
      .insert(productAnswers)
      .values({ questionId: question.id, answeredBy: user.id, body: parsed.data.body });
    await tx
      .update(productQuestions)
      .set({ status: 'answered' })
      .where(eq(productQuestions.id, question.id));
  });

  await notify({
    eventKey: 'question.answered',
    channel: 'inapp',
    recipientUserId: question.userId,
    recipientRole: 'customer',
    locale: 'fa',
    values: { productTitle: pickLocale(question.productTitle, 'fa') },
  });

  revalidatePath(`/products/${question.productSlug}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/questions');
  return { ok: true };
}

/**
 * Admin moderation (Prompt P4): hide an abusive question, or put it back.
 *
 * The same shape as review moderation (PRD §7.2): admin decides VISIBILITY and
 * never wording. There is no edit here and there must not be one.
 */
export async function setQuestionHidden(
  questionId: string,
  hidden: boolean,
): Promise<QuestionResult> {
  const user = await currentUser();
  if (!user?.id || user.role !== 'admin') return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(questionId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [answer] = await db
    .select({ id: productAnswers.id })
    .from(productAnswers)
    .where(eq(productAnswers.questionId, parsed.data))
    .limit(1);

  const [updated] = await db
    .update(productQuestions)
    // Restoring returns it to whichever state it was really in: answered if an
    // answer exists, pending if not. A blanket 'pending' would drop a shop's
    // reply out of sight while leaving the row in the queue forever.
    .set({ status: hidden ? 'hidden' : answer ? 'answered' : 'pending' })
    .where(eq(productQuestions.id, parsed.data))
    .returning({ productId: productQuestions.productId });

  if (!updated) return { ok: false, error: 'not_found' };

  const [product] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, updated.productId))
    .limit(1);

  if (product) revalidatePath(`/products/${product.slug}`);
  revalidatePath('/admin/reviews');
  return { ok: true };
}
