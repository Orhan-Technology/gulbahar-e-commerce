'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { shops } from '../db/schema';
import { assertSupportedImage, storeImage } from '../images';
import { toAsciiDigits } from '../digits';
import { isCanonicalHours } from '../opening';

/**
 * Shop profile (PRD §6.6).
 *
 * A shop may edit its own profile but NOT its own status: approval is admin's
 * (PRD §7.1), so `status` is absent from the schema below rather than filtered out
 * later. The same goes for the category — a shop picks from the admin-owned
 * taxonomy, which is why only a category id is accepted.
 */

/**
 * `fields` is the field-level surface (Prompt: errors have no field-level home).
 *
 * A toast is the weakest possible place to put a validation error for someone
 * standing behind a counter in a noisy mall: it appears somewhere else on the
 * screen, it says a sentence about a field it cannot point at, and it is gone in
 * four seconds. The code still rides in `error` so the toast keeps working as
 * the secondary signal, and `fields` maps FORM FIELD NAME → code so the input
 * itself can go red and say what to do.
 */
export type ProfileActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fields?: Record<string, string> };

async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId) return null;
  if (user.role !== 'shopkeeper') return null;
  return { userId: user.id, shopId: user.shopId };
}

/**
 * A number field that also accepts «۵۰۰» — see lib/actions/shop-products.ts for
 * why the ACTION normalises as well as the form.
 */
const numeric = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' ? toAsciiDigits(value) : value), schema);

const profileSchema = z.object({
  name: z.object({
    fa: z.string().trim().min(1, { message: 'fa_required' }),
    en: z.string().trim().optional().nullable(),
    ps: z.string().trim().optional().nullable(),
  }),
  description: z.object({
    fa: z.string().trim().max(1200).optional().nullable(),
    en: z.string().trim().max(1200).optional().nullable(),
    ps: z.string().trim().max(1200).optional().nullable(),
  }),
  categoryId: z.string().uuid().nullable().optional(),
  floor: numeric(z.coerce.number().int().min(0).max(10).nullable().optional()),
  unitNumber: z.string().trim().max(20).optional().nullable(),
  phone: z
    .string()
    .trim()
    // Afghan mobile numbers, the same shape the OTP flow accepts.
    .regex(/^07\d{8}$/, { message: 'bad_phone' })
    .optional()
    .nullable(),
  /**
   * Canonical ASCII hours — either the single range this column has always held
   * or the per-day extension of it (`08:00-19:00;fri=closed`). Validated by the
   * parser rather than by a second regex, so the column can only ever hold what
   * the parser can read back (lib/opening.ts).
   */
  hours: z
    .string()
    .trim()
    .refine(isCanonicalHours, { message: 'bad_hours' })
    .optional()
    .nullable(),
});

export type ShopProfileInput = z.input<typeof profileSchema>;

const KNOWN_CODES = new Set(['fa_required', 'bad_phone', 'bad_hours']);

/**
 * Zod path → the name the FORM calls that field.
 *
 * Explicit rather than derived: `name.fa` is `nameFa` in the editor and the
 * mapping is the contract between the two, so it belongs written down where a
 * renamed field breaks visibly instead of silently landing the error nowhere.
 */
const FIELD_BY_PATH: Record<string, string> = {
  'name.fa': 'nameFa',
  'description.fa': 'descriptionFa',
  'description.en': 'descriptionEn',
  'description.ps': 'descriptionPs',
  phone: 'phone',
  hours: 'hours',
  floor: 'floor',
  unitNumber: 'unitNumber',
};

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = FIELD_BY_PATH[issue.path.join('.')];
    // First issue per field wins: two messages under one input is noise, and
    // the first one is the one the reader will act on.
    if (!field || out[field]) continue;
    out[field] = KNOWN_CODES.has(issue.message) ? issue.message : 'invalid_input';
  }
  return out;
}

export async function saveShopProfile(input: ShopProfileInput): Promise<ProfileActionResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return {
      ok: false,
      error: message && KNOWN_CODES.has(message) ? message : 'invalid_input',
      fields: fieldErrors(parsed.error),
    };
  }

  const data = parsed.data;

  const [updated] = await db
    .update(shops)
    .set({
      name: { fa: data.name.fa, en: data.name.en ?? null, ps: data.name.ps ?? null },
      description: data.description.fa
        ? {
            fa: data.description.fa,
            en: data.description.en ?? null,
            ps: data.description.ps ?? null,
          }
        : null,
      categoryId: data.categoryId ?? null,
      floor: data.floor ?? null,
      unitNumber: data.unitNumber || null,
      phone: data.phone || null,
      hours: data.hours || null,
    })
    .where(eq(shops.id, context.shopId))
    .returning({ slug: shops.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard/profile');
  revalidatePath(`/shops/${updated.slug}`);
  revalidatePath('/shops');
  return { ok: true };
}

/**
 * Logo or banner upload (PRD §6.6).
 *
 * Runs through the same storeImage() pipeline as products, so a shop logo gets the
 * same WebP variants and the UI can treat every image path identically.
 */
export async function uploadShopImage(
  kind: 'logo' | 'banner',
  formData: FormData,
): Promise<ProfileActionResult<{ path: string }>> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = z.enum(['logo', 'banner']).safeParse(kind);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'no_file' };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'too_large' };

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await assertSupportedImage(buffer);
  } catch {
    return { ok: false, error: 'unsupported_format' };
  }

  const stored = await storeImage(buffer, { folder: 'shops' });

  const [updated] = await db
    .update(shops)
    .set(parsed.data === 'logo' ? { logoPath: stored.path } : { bannerPath: stored.path })
    .where(eq(shops.id, context.shopId))
    .returning({ slug: shops.slug });

  if (!updated) return { ok: false, error: 'not_found' };

  revalidatePath('/dashboard/profile');
  revalidatePath(`/shops/${updated.slug}`);
  revalidatePath('/shops');
  return { ok: true, data: { path: stored.path } };
}
