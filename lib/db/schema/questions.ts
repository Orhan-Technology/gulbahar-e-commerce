import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { products } from './products';
import { createdAt, questionStatusEnum } from './shared';
import { shops } from './shops';
import { users } from './users';

/**
 * Customer questions on a product, answered by the shop (Prompt P4).
 *
 * Deliberately NOT modelled as a review with no rating. A review is a verdict
 * after a purchase and is gated on one — the unique key on `order_item_id` is
 * the whole enforcement mechanism there. A question comes BEFORE a purchase,
 * from someone deciding, and gating it on having bought the thing would empty
 * the section of the only people who need it.
 *
 * `shopId` is denormalised from the product so the shopkeeper's queue can be
 * scoped without joining products on every read — the dashboard asks "what is
 * waiting on me" far more often than the product page asks "what was asked
 * about this".
 *
 * VISIBILITY, enforced in the queries rather than the UI:
 * - `answered` is public.
 * - `pending` is visible to its author and to the owning shop, and to nobody
 *   else. A public list of unanswered questions is a list of a shop's silences.
 * - `hidden` is the admin's moderation outcome and is visible to no one.
 */
export const productQuestions = pgTable(
  'product_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: questionStatusEnum('status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (table) => [
    index('product_questions_product_status_idx').on(table.productId, table.status),
    // The shopkeeper's queue: their own shop, oldest unanswered first.
    index('product_questions_shop_status_idx').on(table.shopId, table.status, table.createdAt),
    index('product_questions_user_idx').on(table.userId),
  ],
);

/**
 * The shop's answer. One per question in practice, but a table rather than a
 * column on the question so an answer carries its own author and timestamp —
 * an admin answering on a shop's behalf is a different fact from the shop
 * answering, and a column would flatten the two.
 */
export const productAnswers = pgTable(
  'product_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => productQuestions.id, { onDelete: 'cascade' }),
    answeredBy: uuid('answered_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('product_answers_question_idx').on(table.questionId)],
);

export type ProductQuestion = typeof productQuestions.$inferSelect;
export type NewProductQuestion = typeof productQuestions.$inferInsert;
export type ProductAnswer = typeof productAnswers.$inferSelect;
export type NewProductAnswer = typeof productAnswers.$inferInsert;
