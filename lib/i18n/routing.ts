import { defineRouting } from 'next-intl/routing';

/**
 * Dari (fa) is the primary locale and the design default (PRD §10.3).
 * English is the verified secondary; Pashto structure is present with
 * strings deferred to phase 2 (PRD §11).
 */
export const routing = defineRouting({
  locales: ['fa', 'en', 'ps'],
  defaultLocale: 'fa',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];

/** RTL locales — drives the html dir attribute and every mirrored layout. */
export const rtlLocales: readonly AppLocale[] = ['fa', 'ps'];

export function localeDirection(locale: string): 'rtl' | 'ltr' {
  return rtlLocales.includes(locale as AppLocale) ? 'rtl' : 'ltr';
}
