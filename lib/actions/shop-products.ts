'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { productImages, productVariants, products } from '../db/schema';
import { toAsciiDigits } from '../digits';
import { assertSupportedImage, storeImage } from '../images';

/**
 * Shopkeeper product mutations (PRD §6.2).
 *
 * OWNERSHIP IS ENFORCED IN EVERY ACTION, in the WHERE clause rather than as a
 * prior check. The permission model (PRD §3.1) says shops own their content, and
 * the only way to guarantee that against a forged id is to make the shop id part
 * of the predicate that finds the row.
 *
 * Admin deliberately has no path in here: admin can unpublish but never edit shop
 * content, so there is no admin branch to bypass.
 */

async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId) return null;
  // Only a shopkeeper may write shop content — an admin session must not.
  if (user.role !== 'shopkeeper') return null;
  return { userId: user.id, shopId: user.shopId };
}

/** `fields` maps FORM FIELD NAME → code; see lib/actions/shop-profile.ts. */
export type ProductActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fields?: Record<string, string> };

/* -------------------------------------------------------------------------- */

const localizedField = z.object({
  fa: z.string().trim().min(1, { message: 'fa_required' }),
  en: z.string().trim().optional().nullable(),
  ps: z.string().trim().optional().nullable(),
});

const optionalLocalizedField = z.object({
  fa: z.string().trim().optional().nullable(),
  en: z.string().trim().optional().nullable(),
  ps: z.string().trim().optional().nullable(),
});

const variantSchema = z.object({
  name: localizedField,
  options: z.array(localizedField).min(1),
});

/*
 * Specification rows (Prompt P1).
 *
 * `key` is validated as a slug because it is the COMPARISON AXIS — the compare
 * table in P3 lines four products up by matching keys, and a key with a space
 * or a capital in it silently fails to match the same spec from another shop.
 * A row with no value is DROPPED rather than rejected: the editor pre-fills the
 * whole category template, and a shopkeeper who fills six of eight rows should
 * not be told off for the two they left blank.
 */
const attributeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, { message: 'invalid_spec_key' }),
  label: localizedField,
  value: optionalLocalizedField,
  group: z.string().trim().max(40).optional().nullable(),
});

const featureSchema = z.object({
  title: localizedField,
  body: optionalLocalizedField,
});

/**
 * A number field that also accepts «۵۰۰».
 *
 * The forms sanitise before they submit, but the ACTION is the boundary and it
 * has to hold on its own — an import, a check script, or a future screen may
 * hand it exactly what a Persian keyboard produces, and `z.coerce.number()`
 * turns «۵۰۰» into NaN. One implementation for both sides (lib/digits.ts): the
 * transliteration only, so "۱۲.۵" still becomes 12.5 and still fails `.int()`
 * rather than being silently read as 125.
 */
const numeric = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' ? toAsciiDigits(value) : value), schema);

const productSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: localizedField,
    description: optionalLocalizedField.optional(),
    categoryId: z.string().uuid().nullable().optional(),
    price: numeric(z.coerce.number().int().positive({ message: 'price_positive' })),
    discountPrice: numeric(z.coerce.number().int().nonnegative().nullable().optional()),
    stock: numeric(z.coerce.number().int().min(0).max(100000)),
    status: z.enum(['draft', 'published', 'unpublished']),
    variants: z.array(variantSchema).max(4).optional(),
    brand: z.string().trim().max(60).nullable().optional(),
    model: z.string().trim().max(60).nullable().optional(),
    attributes: z.array(attributeSchema).max(40).optional(),
    features: z.array(featureSchema).max(12).optional(),
  })
  .refine(
    (value) =>
      value.discountPrice === null ||
      value.discountPrice === undefined ||
      value.discountPrice === 0 ||
      value.discountPrice < value.price,
    { message: 'discount_below_price' },
  );

export type ProductInput = z.input<typeof productSchema>;

/*
 * Only these codes have a translated message. Zod's own default text ("Too
 * small: expected …") would otherwise reach t() as a key and render raw, so
 * anything unrecognised collapses to the generic code.
 */
const KNOWN_CODES = new Set([
  'fa_required',
  'price_positive',
  'discount_below_price',
  'invalid_spec_key',
]);

function errorCode(error: z.ZodError): string {
  const message = error.issues[0]?.message;
  return message && KNOWN_CODES.has(message) ? message : 'invalid_input';
}

/**
 * Zod path → the name the FORM calls that field, so the error can be printed
 * under the input it is about instead of only in a toast that names none.
 *
 * `discount_below_price` arrives from a `.refine()` on the OBJECT, so its path
 * is empty — it is attributed to the discount field by hand below, because that
 * is the field the shopkeeper has to change.
 */
const FIELD_BY_PATH: Record<string, string> = {
  'title.fa': 'titleFa',
  'description.fa': 'descriptionFa',
  price: 'price',
  discountPrice: 'discountPrice',
  stock: 'stock',
  brand: 'brand',
  model: 'model',
};

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const code = KNOWN_CODES.has(issue.message) ? issue.message : 'invalid_input';
    const field =
      issue.path.length === 0 && issue.message === 'discount_below_price'
        ? 'discountPrice'
        : FIELD_BY_PATH[issue.path.join('.')];
    if (!field || out[field]) continue;
    out[field] = code;
  }
  return out;
}

/** Slug derived from the Dari title, since that is the required field. */
function slugify(value: string, suffix: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // Non-Latin titles collapse to almost nothing, so always keep a stable suffix.
  return `${base || 'product'}-${suffix}`;
}

export async function saveProduct(
  input: ProductInput,
): Promise<ProductActionResult<{ id: string; slug: string }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: errorCode(parsed.error), fields: fieldErrors(parsed.error) };
  }

  const data = parsed.data;
  const discountPrice =
    data.discountPrice === undefined || data.discountPrice === null || data.discountPrice === 0
      ? null
      : data.discountPrice;

  const values = {
    title: { fa: data.title.fa, en: data.title.en ?? null, ps: data.title.ps ?? null },
    description: data.description?.fa
      ? {
          fa: data.description.fa,
          en: data.description.en ?? null,
          ps: data.description.ps ?? null,
        }
      : null,
    categoryId: data.categoryId ?? null,
    price: data.price,
    discountPrice,
    stock: data.stock,
    status: data.status,
    brand: data.brand?.trim() || null,
    model: data.model?.trim() || null,
    /*
     * Empty rows are dropped HERE rather than in the form. The editor hands
     * back the whole category template so the shopkeeper can see which specs
     * their category expects, and the ones they never filled must not reach the
     * product page as blank cells — a spec table with an empty value column
     * reads as a broken import, which is exactly what "never render N/A" means.
     */
    attributes: (data.attributes ?? [])
      .filter((row) => row.value.fa?.trim())
      .map((row) => ({
        key: row.key,
        label: { fa: row.label.fa, en: row.label.en ?? null, ps: row.label.ps ?? null },
        value: { fa: row.value.fa!.trim(), en: row.value.en?.trim() || null, ps: row.value.ps?.trim() || null },
        ...(row.group ? { group: row.group } : {}),
      })),
    features: (data.features ?? [])
      .filter((feature) => feature.title.fa.trim() && feature.body.fa?.trim())
      .map((feature) => ({
        title: { fa: feature.title.fa, en: feature.title.en ?? null, ps: feature.title.ps ?? null },
        body: { fa: feature.body.fa!.trim(), en: feature.body.en?.trim() || null, ps: feature.body.ps?.trim() || null },
      })),
  };

  let productId = data.id;
  let slug: string;

  if (productId) {
    const [updated] = await db
      .update(products)
      .set(values)
      // shopId in the predicate is the ownership check.
      .where(
        and(
          eq(products.id, productId),
          eq(products.shopId, context.shopId),
          /*
           * An archived row is not editable, and refusing here is what keeps
           * `restoreProduct` the ONLY way out of the archive. Without it, saving
           * the edit form against an archived product would quietly set a live
           * status again — an un-delete nobody asked for and nobody confirmed.
           */
          sql`${products.status} <> 'archived'`,
        ),
      )
      .returning({ id: products.id, slug: products.slug });

    if (!updated) return { ok: false, error: 'not_found' };
    slug = updated.slug;
  } else {
    const suffix = Math.random().toString(36).slice(2, 8);
    slug = slugify(data.title.fa, suffix);

    const [created] = await db
      .insert(products)
      .values({ ...values, shopId: context.shopId, slug })
      .returning({ id: products.id, slug: products.slug });

    productId = created.id;
    slug = created.slug;
  }

  // Variants are replaced wholesale: they are a small ordered set, and diffing
  // them would add complexity for no user-visible benefit.
  await db.delete(productVariants).where(eq(productVariants.productId, productId));
  if (data.variants && data.variants.length > 0) {
    await db.insert(productVariants).values(
      data.variants.map((variant, index) => ({
        productId: productId!,
        name: { fa: variant.name.fa, en: variant.name.en ?? null, ps: variant.name.ps ?? null },
        options: variant.options.map((option) => ({
          fa: option.fa,
          en: option.en ?? null,
          ps: option.ps ?? null,
        })),
        sort: index,
      })),
    );
  }

  revalidatePath('/dashboard/products');
  revalidatePath(`/products/${slug}`);
  revalidatePath('/products');

  return { ok: true, data: { id: productId, slug } };
}

/** Inline stock edit from the product list (PRD §6.2). */
export async function setProductStock(
  productId: string,
  stock: number,
): Promise<ProductActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z
    .object({ productId: z.string().uuid(), stock: z.number().int().min(0).max(100000) })
    .safeParse({ productId, stock });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(products)
    .set({ stock: parsed.data.stock })
    .where(and(eq(products.id, parsed.data.productId), eq(products.shopId, context.shopId)))
    .returning({ slug: products.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard/products');
  revalidatePath(`/products/${updated.slug}`);
  return { ok: true };
}

/**
 * The shopkeeper's DELETE (Prompt: a mis-created product is permanent clutter).
 *
 * It archives rather than deletes, and that is not a euphemism — a product that
 * has ever been ordered is referenced by order_items, and removing the row would
 * either fail on the foreign key or erase what a customer bought from their own
 * order history. Archiving hides it from every surface INCLUDING this shop's own
 * catalogue list, which is what the word "delete" means to the person pressing
 * it, while the history keeps naming the thing that was sold.
 *
 * Reversible on purpose: `restoreProduct` brings it back as unpublished, so the
 * mistake of archiving the wrong row costs two taps rather than a re-entry.
 */
export async function archiveProduct(productId: string): Promise<ProductActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(products)
    .set({ status: 'archived' })
    .where(
      and(
        eq(products.id, parsed.data),
        eq(products.shopId, context.shopId),
        sql`${products.status} <> 'archived'`,
      ),
    )
    .returning({ slug: products.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard/products');
  revalidatePath('/dashboard');
  // The product page and every listing it appeared on now have one fewer row.
  revalidatePath(`/products/${updated.slug}`);
  revalidatePath('/products');
  return { ok: true };
}

/**
 * Out of the archive, as UNPUBLISHED.
 *
 * Never straight back to published: the shop archived it, time has passed, and
 * putting it in front of customers again without anyone looking at the price or
 * the stock first is a decision the platform should not make on their behalf.
 */
export async function restoreProduct(productId: string): Promise<ProductActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [updated] = await db
    .update(products)
    .set({ status: 'unpublished' })
    .where(
      and(
        eq(products.id, parsed.data),
        eq(products.shopId, context.shopId),
        eq(products.status, 'archived'),
      ),
    )
    .returning({ slug: products.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard/products');
  revalidatePath('/dashboard');
  return { ok: true };
}

/** Bulk publish / unpublish (PRD §6.2). */
export async function bulkSetProductStatus(
  productIds: string[],
  status: 'published' | 'unpublished',
): Promise<ProductActionResult<{ updated: number }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.array(z.string().uuid()).min(1).max(200).safeParse(productIds);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const updated = await db
    .update(products)
    .set({
      status,
      /*
       * `unpublishReason` is admin's note explaining why mall management took
       * the product off the storefront, and it is only meaningful while the
       * product is unpublished. Publishing clears it — otherwise the shop
       * republishes, fixes nothing, and the stale reason stays attached to a
       * live product, where the next reader takes it for a current complaint.
       */
      ...(status === 'published' ? { unpublishReason: null } : {}),
    })
    .where(
      and(
        inArray(products.id, parsed.data),
        eq(products.shopId, context.shopId),
        // Same rule as the edit form: only restoreProduct leaves the archive.
        sql`${products.status} <> 'archived'`,
      ),
    )
    .returning({ id: products.id });

  revalidatePath('/dashboard/products');
  revalidatePath('/products');
  return { ok: true, data: { updated: updated.length } };
}

/**
 * Multi-image upload (PRD §6.2).
 *
 * Goes through the same lib/images.ts storeImage() the seed pipeline uses, so
 * uploaded and seeded images are indistinguishable to the UI and both get the
 * 800w/240w WebP variants.
 */
export async function uploadProductImages(
  productId: string,
  formData: FormData,
): Promise<ProductActionResult<{ added: number }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const [owned] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.shopId, context.shopId)))
    .limit(1);
  if (!owned) return { ok: false, error: 'not_found' };

  const files = formData.getAll('images').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return { ok: false, error: 'no_files' };
  if (files.length > 8) return { ok: false, error: 'too_many' };

  const [{ nextSort } = { nextSort: 0 }] = await db
    .select({ nextSort: sql<number>`coalesce(max(${productImages.sort}) + 1, 0)::int` })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  let added = 0;
  for (const [index, file] of files.entries()) {
    if (file.size === 0) continue;
    // 8MB ceiling: phone photos are large and there is no CDN to hide behind.
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'too_large' };

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      await assertSupportedImage(buffer);
    } catch {
      return { ok: false, error: 'unsupported_format' };
    }

    const stored = await storeImage(buffer, { folder: 'products' });
    await db.insert(productImages).values({
      productId,
      path: stored.path,
      sort: Number(nextSort) + index,
    });
    added += 1;
  }

  revalidatePath('/dashboard/products');
  return { ok: true, data: { added } };
}

export async function deleteProductImage(imageId: string): Promise<ProductActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.string().uuid().safeParse(imageId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  /*
   * Ownership is checked through the product, since product_images has no shop_id.
   * The file itself is left on disk: an image may be referenced by an order's
   * snapshot history, and orphan files are cheap next to a broken order record.
   */
  const [image] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .innerJoin(products, eq(productImages.productId, products.id))
    .where(and(eq(productImages.id, parsed.data), eq(products.shopId, context.shopId)))
    .limit(1);

  if (!image) return { ok: false, error: 'not_found' };

  await db.delete(productImages).where(eq(productImages.id, parsed.data));
  revalidatePath('/dashboard/products');
  return { ok: true };
}

/** Persists a drag-reordered image sequence. */
export async function reorderProductImages(
  productId: string,
  orderedIds: string[],
): Promise<ProductActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.array(z.string().uuid()).min(1).max(20).safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [owned] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.shopId, context.shopId)))
    .limit(1);
  if (!owned) return { ok: false, error: 'not_found' };

  for (const [index, id] of parsed.data.entries()) {
    await db
      .update(productImages)
      .set({ sort: index })
      .where(and(eq(productImages.id, id), eq(productImages.productId, productId)));
  }

  revalidatePath('/dashboard/products');
  return { ok: true };
}
