import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '..';
import { productAnswers, productQuestions, products, shops, users } from '../schema';

/**
 * Product Q&A reads (Prompt P4).
 *
 * The visibility rule lives HERE, not in the components: `answered` is public,
 * `pending` belongs to its author and to the owning shop, `hidden` to nobody. A
 * rule enforced in a component is a rule that the next component forgets.
 */

export type QuestionThread = {
  id: string;
  body: string;
  status: 'pending' | 'answered' | 'hidden';
  createdAt: Date;
  askerName: string;
  /** True when the viewer wrote it — drives the "awaiting an answer" chip. */
  mine: boolean;
  answer: { body: string; createdAt: Date } | null;
};

/**
 * The questions a given viewer may see on a product page.
 *
 * `viewerId` null is a signed-out visitor, who sees answered questions only.
 * The owning shop's own members see their pending queue here too, which is what
 * makes the section usable as a shop's own to-do list on the storefront.
 */
export async function productQuestionThreads(
  productId: string,
  viewerId: string | null,
  viewerShopId: string | null,
): Promise<QuestionThread[]> {
  const visible = viewerId
    ? or(
        eq(productQuestions.status, 'answered'),
        and(eq(productQuestions.status, 'pending'), eq(productQuestions.userId, viewerId)),
        viewerShopId
          ? and(eq(productQuestions.status, 'pending'), eq(productQuestions.shopId, viewerShopId))
          : undefined,
      )
    : eq(productQuestions.status, 'answered');

  const rows = await db
    .select({
      id: productQuestions.id,
      body: productQuestions.body,
      status: productQuestions.status,
      createdAt: productQuestions.createdAt,
      userId: productQuestions.userId,
      askerName: users.name,
      answerBody: productAnswers.body,
      answerCreatedAt: productAnswers.createdAt,
    })
    .from(productQuestions)
    .innerJoin(users, eq(productQuestions.userId, users.id))
    .leftJoin(productAnswers, eq(productAnswers.questionId, productQuestions.id))
    .where(and(eq(productQuestions.productId, productId), visible))
    .orderBy(desc(productQuestions.createdAt))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt,
    // First name only. The asker is a customer, not a reviewer with a verified
    // purchase behind them, and a full name on an idle question is more
    // exposure than the question is worth.
    askerName: row.askerName.split(' ')[0] ?? row.askerName,
    mine: row.userId === viewerId,
    answer: row.answerBody ? { body: row.answerBody, createdAt: row.answerCreatedAt! } : null,
  }));
}

/** How many answered questions a product has, for the section's count chip. */
export async function answeredQuestionCount(productId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(productQuestions)
    .where(and(eq(productQuestions.productId, productId), eq(productQuestions.status, 'answered')));

  return Number(row?.total ?? 0);
}

export type ShopQuestionRow = {
  id: string;
  body: string;
  status: 'pending' | 'answered' | 'hidden';
  createdAt: Date;
  askerName: string;
  productSlug: string;
  productTitle: unknown;
  productImage: string | null;
  answer: { body: string; createdAt: Date } | null;
};

/**
 * A shop's own questions (Prompt P4).
 *
 * Oldest PENDING first, because that is the one that has been waiting longest —
 * the opposite of the storefront, where newest first is what a reader wants.
 */
export async function shopQuestions(
  shopId: string,
  status?: 'pending' | 'answered',
): Promise<ShopQuestionRow[]> {
  const rows = await db
    .select({
      id: productQuestions.id,
      body: productQuestions.body,
      status: productQuestions.status,
      createdAt: productQuestions.createdAt,
      askerName: users.name,
      productSlug: products.slug,
      productTitle: products.title,
      productImage: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = ${products.id}
        order by pi.sort asc limit 1
      )`,
      answerBody: productAnswers.body,
      answerCreatedAt: productAnswers.createdAt,
    })
    .from(productQuestions)
    .innerJoin(users, eq(productQuestions.userId, users.id))
    .innerJoin(products, eq(productQuestions.productId, products.id))
    .leftJoin(productAnswers, eq(productAnswers.questionId, productQuestions.id))
    .where(
      and(
        eq(productQuestions.shopId, shopId),
        status ? eq(productQuestions.status, status) : inArray(productQuestions.status, ['pending', 'answered']),
      ),
    )
    .orderBy(asc(productQuestions.status), asc(productQuestions.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt,
    askerName: row.askerName,
    productSlug: row.productSlug,
    productTitle: row.productTitle,
    productImage: row.productImage,
    answer: row.answerBody ? { body: row.answerBody, createdAt: row.answerCreatedAt! } : null,
  }));
}

/** Counts for the dashboard's filter chips. */
export async function shopQuestionCounts(shopId: string) {
  const rows = await db
    .select({ status: productQuestions.status, total: sql<number>`count(*)::int` })
    .from(productQuestions)
    .where(eq(productQuestions.shopId, shopId))
    .groupBy(productQuestions.status);

  const map = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  return {
    pending: map.pending ?? 0,
    answered: map.answered ?? 0,
  };
}

/**
 * Unanswered questions across the whole platform, for admin moderation.
 *
 * Includes ANSWERED ones too: what the admin moderates is abuse, and an abusive
 * question does not stop being abusive because the shop replied politely.
 */
export async function adminQuestions(limit = 50) {
  return db
    .select({
      id: productQuestions.id,
      body: productQuestions.body,
      status: productQuestions.status,
      createdAt: productQuestions.createdAt,
      askerName: users.name,
      productSlug: products.slug,
      productTitle: products.title,
      shopName: shops.name,
      answerBody: productAnswers.body,
    })
    .from(productQuestions)
    .innerJoin(users, eq(productQuestions.userId, users.id))
    .innerJoin(products, eq(productQuestions.productId, products.id))
    .innerJoin(shops, eq(productQuestions.shopId, shops.id))
    .leftJoin(productAnswers, eq(productAnswers.questionId, productQuestions.id))
    .orderBy(desc(productQuestions.createdAt))
    .limit(limit);
}
