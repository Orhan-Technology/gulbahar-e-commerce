import { cache } from 'react';
import { eq } from 'drizzle-orm';

import { db } from '..';
import { platformSettings, type PlatformSettings } from '../schema';

/**
 * The marketplace's own settings, read once per request (Prompt A4).
 *
 * `cache()` because this is genuinely read on every storefront render — the
 * footer's delivery promise, the cart's free-delivery hint, checkout's summary
 * and the support page all want the same row, and without deduping a single
 * page load would ask four times for a table with one row in it.
 *
 * FALLING BACK TO DEFAULTS RATHER THAN THROWING is deliberate. This row is
 * seeded, but the storefront must still render against a freshly pushed schema
 * with no seed — a demo that 500s on `db:push` before `db:seed` is a demo that
 * looks broken for reasons that have nothing to do with the code being shown.
 * The defaults are the values the app shipped with as constants, so the
 * unseeded state is identical to the pre-A4 behaviour rather than to an empty
 * screen.
 */
export const DEFAULT_SETTINGS: Omit<PlatformSettings, 'id' | 'updatedAt'> = {
  mallName: { fa: 'مرکز خرید گلبهار', en: 'Gulbahar Center' },
  address: { fa: 'سرک دوم، ناحیه چهارم، کابل', en: 'Second Street, District 4, Kabul' },
  hours: '08:00-19:00',
  supportPhone: '0202201400',
  deliveryFee: 150,
  freeDeliveryThreshold: 20000,
  currencyLabel: { fa: 'افغانی', en: 'AFN' },
  defaultLocale: 'fa',
  // Pashto is structure-only (PRD §11) — offering it in the switcher would send
  // a visitor to a half-translated storefront.
  publishedLocales: ['fa', 'en'],
};

export const siteSettings = cache(async () => {
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);

  return row ?? { id: 1, updatedAt: new Date(0), ...DEFAULT_SETTINGS };
});

/** The delivery rates alone — the shape `deliveryFeeFor()` takes. */
export async function deliveryRates() {
  const settings = await siteSettings();
  return {
    fee: settings.deliveryFee,
    threshold: settings.freeDeliveryThreshold,
  };
}
