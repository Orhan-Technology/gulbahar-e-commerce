'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { categories, orderItems, orders, products, reviews, shopMembers, users } from '../db/schema';
import { notify } from '../notify';

/**
 * Catalogue governance (PRD §7.2).
 *
 * The two halves of this file are governed by one rule from PRD §3.1: admin can
 * UNPUBLISH but never EDIT shop content. So there is a `unpublishProduct` and no
 * `editProduct`, and the taxonomy — which admin genuinely owns — gets full CRUD.
 *
 * Review moderation follows the same shape: admin decides visibility, never
 * wording. Nothing here rewrites a customer's review or a shop's reply.
 */

export type AdminActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

async function requireAdminContext() {
  const user = await currentUser();
  if (!user?.id || user.role !== 'admin') return null;
  return { userId: user.id };
}

/* -------------------------------------------------------------------------- */
/* Products — unpublish only                                                  */

/**
 * Takes a product off the storefront (PRD §7.2).
 *
 * Sets status to 'unpublished' — the same state a shop can put its own product in.
 * That is deliberate: the shop sees the change in their own list under a status
 * they understand, and they can republish. A dedicated admin-only status would let
 * admin lock a shop out of its own catalogue, which PRD §3.1 does not allow.
 *
 * Only a PUBLISHED product can be taken down, so the action cannot quietly reverse
 * a shop's own draft decision.
 */
export async function unpublishProduct(productId: string): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(products)
    .set({ status: 'unpublished' })
    .where(and(eq(products.id, parsed.data), eq(products.status, 'published')))
    .returning({ slug: products.slug });

  if (!updated) return { ok: false, error: 'not_published' };

  revalidatePath('/admin/products');
  revalidatePath('/products');
  revalidatePath(`/products/${updated.slug}`);
  revalidatePath('/dashboard/products');
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Categories — admin owns the taxonomy                                       */

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(2, { message: 'slug_required' })
    // ASCII slug: category slugs appear in storefront URLs and are admin-authored,
    // unlike product slugs which derive from Dari titles.
    .regex(/^[a-z0-9-]+$/, { message: 'bad_slug' })
    .max(60),
  name: z.object({
    fa: z.string().trim().min(1, { message: 'fa_required' }),
    en: z.string().trim().optional().nullable(),
    ps: z.string().trim().optional().nullable(),
  }),
  parentId: z.string().uuid().nullable().optional(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
});

const KNOWN_CATEGORY_CODES = new Set(['slug_required', 'bad_slug', 'fa_required']);

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause;
  return (error as { code?: string }).code === '23505' || cause?.code === '23505';
}

export async function saveCategory(
  input: z.input<typeof categorySchema>,
): Promise<AdminActionResult<{ id: string }>> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message && KNOWN_CATEGORY_CODES.has(message) ? message : 'invalid_input',
    };
  }

  const data = parsed.data;

  // Two levels only, matching the storefront's category → subcategory navigation.
  // Without this a nested-under-a-child node would simply never be reachable.
  if (data.parentId) {
    const [parent] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, data.parentId))
      .limit(1);
    if (!parent) return { ok: false, error: 'parent_not_found' };
    if (parent.parentId !== null) return { ok: false, error: 'too_deep' };
  }

  // A node cannot be its own parent, and neither can a parent be moved under its
  // own child — that would detach the whole subtree from every root.
  if (data.id && data.parentId === data.id) return { ok: false, error: 'cycle' };
  if (data.id && data.parentId) {
    const [child] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, data.id))
      .limit(1);
    if (child?.id === data.parentId) return { ok: false, error: 'cycle' };
  }

  const values = {
    slug: data.slug,
    name: { fa: data.name.fa, en: data.name.en ?? null, ps: data.name.ps ?? null },
    parentId: data.parentId ?? null,
    sort: data.sort ?? 0,
  };

  try {
    if (data.id) {
      const [updated] = await db
        .update(categories)
        .set(values)
        .where(eq(categories.id, data.id))
        .returning({ id: categories.id });
      if (!updated) return { ok: false, error: 'not_found' };
      revalidateTaxonomy();
      return { ok: true, data: { id: updated.id } };
    }

    const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
    revalidateTaxonomy();
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    /*
     * Detect the unique violation by SQLSTATE (23505) on the CAUSE. Two traps here:
     * matching the message text fails because postgres.js does not put the index
     * name in it, and reading `error.code` fails because drizzle wraps driver
     * errors in a DrizzleQueryError whose own `code` is undefined — the real
     * PostgresError is at `.cause`. Either mistake makes this catch dead code and
     * the action 500s instead of reporting "slug taken".
     */
    if (isUniqueViolation(error)) return { ok: false, error: 'slug_taken' };
    throw error;
  }
}

/**
 * Deletes a category, but only when nothing references it (PRD §7.2).
 *
 * Products, shops and child categories all block it. The schema would cascade or
 * null these out silently; refusing is the honest behaviour, because a category
 * with 40 products behind it is almost never something an admin means to remove.
 */
export async function deleteCategory(categoryId: string): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(categoryId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [refs] = await db
    .select({
      products: sql<number>`(select count(*)::int from products p where p.category_id = ${parsed.data})`,
      shops: sql<number>`(select count(*)::int from shops s where s.category_id = ${parsed.data})`,
      children: sql<number>`(select count(*)::int from categories c where c.parent_id = ${parsed.data})`,
    })
    .from(sql`(select 1) as one`);

  if (refs.children > 0) return { ok: false, error: 'has_children' };
  if (refs.products > 0) return { ok: false, error: 'has_products' };
  if (refs.shops > 0) return { ok: false, error: 'has_shops' };

  const [deleted] = await db
    .delete(categories)
    .where(eq(categories.id, parsed.data))
    .returning({ id: categories.id });

  if (!deleted) return { ok: false, error: 'not_found' };

  revalidateTaxonomy();
  return { ok: true };
}

/** Persists a reordered sibling list. */
export async function reorderCategories(orderedIds: string[]): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.array(z.string().uuid()).min(1).max(60).safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  for (const [index, id] of parsed.data.entries()) {
    await db.update(categories).set({ sort: index }).where(eq(categories.id, id));
  }

  revalidateTaxonomy();
  return { ok: true };
}

function revalidateTaxonomy() {
  revalidatePath('/admin/categories');
  revalidatePath('/');
  revalidatePath('/categories');
  revalidatePath('/products');
}

/* -------------------------------------------------------------------------- */
/* Review moderation                                                          */

const moderateSchema = z.object({
  reviewId: z.string().uuid(),
  decision: z.enum(['remove', 'uphold']),
});

/**
 * Resolves a reported review (PRD §7.2).
 *
 * 'uphold' returns it to visible — the report was unfounded and the review stands.
 * 'remove' hides it from the storefront but keeps the row, so the decision is
 * auditable and the rating maths can be re-derived if it is ever reinstated.
 */
export async function moderateReview(
  input: z.input<typeof moderateSchema>,
): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(reviews)
    .set({ status: parsed.data.decision === 'remove' ? 'removed' : 'visible' })
    .where(eq(reviews.id, parsed.data.reviewId))
    .returning({ productId: reviews.productId });

  if (!updated) return { ok: false, error: 'not_found' };

  const [product] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, updated.productId))
    .limit(1);

  // Removing a review changes the product's derived rating, which is on cards
  // everywhere as well as the product page.
  revalidatePath('/admin/reviews');
  revalidatePath('/products');
  if (product) revalidatePath(`/products/${product.slug}`);
  revalidatePath('/dashboard/reviews');
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */

/**
 * Deactivates or reactivates an account (PRD §7.5).
 *
 * `active: false` is checked at sign-in, so this locks the person out without
 * deleting anything they are attached to — an order references its user with ON
 * DELETE RESTRICT precisely so history cannot be erased.
 */
export async function setUserActive(userId: string, active: boolean): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z
    .object({ userId: z.string().uuid(), active: z.boolean() })
    .safeParse({ userId, active });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  // An admin locking themselves out mid-demo would be unrecoverable without a
  // database console.
  if (parsed.data.userId === context.userId) return { ok: false, error: 'cannot_deactivate_self' };

  const [updated] = await db
    .update(users)
    .set({ active: parsed.data.active })
    .where(eq(users.id, parsed.data.userId))
    .returning({ id: users.id });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/admin/users');
  return { ok: true };
}

/**
 * Nudges a shop about an order it has left sitting (Prompt C4).
 *
 * The admin's job here is a LANDLORD'S, not a moderator's: they cannot accept
 * the order on the shop's behalf — that would put mall management inside a
 * tenant's transaction (PRD §3.1) — but they can make sure the tenant knows.
 * So this writes a notification and nothing else, and the order's state is
 * untouched.
 */
export async function nudgeShopAboutOrder(orderId: string): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      shopId: orderItems.shopId,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orders.id, parsed.data))
    .limit(1);

  if (!order) return { ok: false, error: 'not_found' };
  // Nudging a finished order would be the mall chasing work already done.
  if (order.status !== 'placed' && order.status !== 'accepted') {
    return { ok: false, error: 'not_pending' };
  }

  const [owner] = await db
    .select({ userId: shopMembers.userId })
    .from(shopMembers)
    .where(and(eq(shopMembers.shopId, order.shopId), eq(shopMembers.role, 'owner')))
    .limit(1);

  await notify({
    eventKey: 'order.nudged',
    channel: 'inapp',
    recipientUserId: owner?.userId ?? null,
    recipientRole: 'shopkeeper',
    locale: 'fa',
    values: { reference: order.reference },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  return { ok: true };
}

/**
 * Changes an account's role, with a written reason (Prompt A4).
 *
 * The NOTE IS REQUIRED and is not decoration. A role change is the single most
 * consequential thing on this screen — promoting to shopkeeper opens the seller
 * panel, promoting to admin hands over the whole platform — and the demo has no
 * audit table, so the note is delivered to the person it happened to as an
 * in-app notification. That makes it a real record in the notification log
 * rather than a field that gets dropped: the admin has to say why, and the
 * subject gets told.
 *
 * Two guards, both about not stranding people:
 * - Never your own account. An admin demoting themselves loses the console with
 *   no way back short of a database client.
 * - Never the last admin, for the same reason at platform scale.
 *
 * A new shopkeeper with no shop is NOT stranded either: the dashboard layout
 * sends them to /dashboard/register-shop, which is the existing onboarding path.
 */
const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['customer', 'shopkeeper', 'admin']),
  note: z.string().trim().min(3).max(200),
});

export async function setUserRole(
  input: z.input<typeof roleChangeSchema>,
): Promise<AdminActionResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }

  if (parsed.data.userId === context.userId) return { ok: false, error: 'cannot_change_own_role' };

  const [subject] = await db
    .select({ id: users.id, role: users.role, locale: users.locale })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!subject) return { ok: false, error: 'not_found' };
  if (subject.role === parsed.data.role) return { ok: true };

  if (subject.role === 'admin') {
    const [{ remaining }] = await db
      .select({ remaining: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true)));

    if (Number(remaining) <= 1) return { ok: false, error: 'last_admin' };
  }

  await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, subject.id));

  // The subject reads their own message, so the role name is resolved in THEIR
  // locale — `ps` falls back to Dari, the same substitution notify() makes,
  // because Pashto strings are deferred (PRD §11).
  const t = await getTranslations({
    locale: subject.locale === 'ps' ? 'fa' : subject.locale,
    namespace: 'adminUsers.roles',
  });

  await notify({
    eventKey: 'user.roleChanged',
    channel: 'inapp',
    recipientUserId: subject.id,
    recipientRole: parsed.data.role,
    locale: subject.locale,
    values: { role: t(parsed.data.role), note: parsed.data.note },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}
