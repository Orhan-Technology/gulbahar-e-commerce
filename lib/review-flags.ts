/**
 * The violation categories a shop may report a review under.
 *
 * A FIXED LIST, and required. The admin moderating the queue used to be handed
 * a reported review with no statement of what was wrong with it, and had to
 * guess from the text whether the shop meant "this is abusive" or "this person
 * never bought from us" — two complaints with opposite outcomes. The short list
 * also keeps the report honest: there is no category for "this is a bad
 * rating", which is the thing a shop most wants to report and the thing the
 * platform must not act on.
 *
 * In its own module rather than beside the action, for a hard reason: every
 * export of a `'use server'` file must be an async function, so a plain `const`
 * there is a build error rather than a style question. Same shape of constraint
 * as the RSC-boundary rules in CLAUDE.md, different boundary.
 */
export const REVIEW_FLAG_REASONS = [
  'offensive',
  'spam',
  'not_a_customer',
  'wrong_product',
  'personal_info',
  'other',
] as const;

export type ReviewFlagReason = (typeof REVIEW_FLAG_REASONS)[number];
