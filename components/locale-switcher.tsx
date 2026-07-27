'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { routing } from '@/lib/i18n/routing';

/**
 * Phase 1 plain-select switcher. Phase 2.2 replaces it with the restyled
 * shadcn Select in the storefront header.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="opacity-70">{t('common.language')}</span>
      <select
        value={locale}
        onChange={(event) => router.replace(pathname, { locale: event.target.value })}
        className="rounded border border-foreground/20 bg-background px-2 py-1"
      >
        {routing.locales.map((value) => (
          <option key={value} value={value}>
            {t(`locales.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
