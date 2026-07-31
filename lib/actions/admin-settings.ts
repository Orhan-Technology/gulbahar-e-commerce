'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db';
import { normalizePhone } from '../auth/otp';
import { platformSettings, type DbLocale } from '../db/schema';
import { requireAdminContext } from '../admin-context';
import { recordAdminAction } from '../audit';

/**
 * Marketplace settings (Prompt A4).
 *
 * The mall's own facts — its name, where it is, when it opens, what delivery
 * costs — belong to the person who runs the mall, not to a constant in
 * lib/offers.ts and a string in messages/fa.json. Everything written here is
 * read by the storefront on the next request: the footer's promises, the cart's
 * free-delivery hint, checkout's summary, and the fee an order is actually
 * charged (lib/actions/checkout.ts).
 *
 * PERMISSION NOTE (PRD §3.1): this file governs the PLATFORM, which admin owns
 * outright. It has no shop or product writer at all, and must not grow one —
 * the boundary between "admin runs the marketplace" and "shops own their
 * content" is kept by the shape of these files, so a future edit cannot widen
 * it by accident.
 */

export type AdminSettingsResult = { ok: true } | { ok: false; error: string };


const localizedText = z.object({
  fa: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).optional(),
});

const marketplaceSchema = z.object({
  mallName: localizedText,
  address: localizedText,
  /*
   * ASCII `HH:MM-HH:MM`, never a display string (CLAUDE.md). `shops.hours` was
   * seeded with formatted Persian digits once, and English visitors read Persian
   * numerals until it was fixed — the same mistake is one careless input away
   * here, so the pattern is enforced rather than trusted.
   */
  hours: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/, { message: 'invalid_hours' }),
  /*
   * NOT `PHONE_PATTERN`, which is the OTP target pattern `07XXXXXXXX`. The
   * mall's support number is a Kabul LANDLINE — the seeded one is 020 220 1400
   * — and validating it as a mobile rejects the very value the app ships with.
   * Nobody signs in as this number; it is dialled from the support page, so the
   * rule is "a plausible Afghan number", not "a device we can text".
   */
  supportPhone: z
    .string()
    .transform(normalizePhone)
    .refine((value) => /^0\d{8,11}$/.test(value), { message: 'invalid_phone' }),
  /** Integer afghanis, like every other money value in the system. */
  deliveryFee: z.number().int().min(0).max(10_000),
  freeDeliveryThreshold: z.number().int().min(0).max(1_000_000),
  // One hour to two weeks. Below an hour is not a hold; above two weeks the
  // shop is a warehouse (Prompt C11).
  pickupHoldHours: z.number().int().min(1).max(336),
  currencyLabel: localizedText,
});

export async function updateMarketplaceSettings(
  input: z.input<typeof marketplaceSchema>,
): Promise<AdminSettingsResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = marketplaceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }

  // Read before the write so the audit line can name what actually MOVED. A
  // settings row has ten fields and an entry saying only "settings changed"
  // sends whoever reads it to a diff they cannot get.
  const [before] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);

  await db
    .update(platformSettings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(platformSettings.id, 1));

  const changed: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    const previous = before?.[key as keyof typeof before];
    const next = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const old = typeof previous === 'object' ? JSON.stringify(previous) : String(previous);
    if (old !== next) changed[key] = next;
  }

  await recordAdminAction({
    ...context,
    action: 'settings.update',
    targetType: 'settings',
    detail: changed,
  });

  /*
   * The layout, not a page: the footer carries the delivery promise and the
   * mall's details on EVERY storefront route, so revalidating /admin/settings
   * and the cart would leave the old fee on the other forty screens.
   */
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Which locales the language switcher offers.
 *
 * Dari is not optional — it is the default locale and the one every seeded
 * string exists in, so unpublishing it would leave the storefront with no
 * complete language at all. Pashto is refused for the opposite reason: its
 * structure is present but its strings are deferred (PRD §11), and publishing
 * it would hand a visitor a half-translated shop. Both rules are enforced here
 * rather than only in the form, because an action is reachable without its UI.
 */
const localesSchema = z
  .array(z.enum(['fa', 'en', 'ps']))
  .min(1)
  .refine((values) => values.includes('fa'), { message: 'default_locale_required' })
  .refine((values) => !values.includes('ps'), { message: 'locale_not_translated' });

export async function updatePublishedLocales(
  locales: DbLocale[],
): Promise<AdminSettingsResult> {
  const context = await requireAdminContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const parsed = localesSchema.safeParse(locales);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }

  await db
    .update(platformSettings)
    .set({ publishedLocales: [...new Set(parsed.data)], updatedAt: new Date() })
    .where(eq(platformSettings.id, 1));

  await recordAdminAction({
    ...context,
    action: 'settings.locales',
    targetType: 'settings',
    detail: { locales: [...new Set(parsed.data)].join(', ') },
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
