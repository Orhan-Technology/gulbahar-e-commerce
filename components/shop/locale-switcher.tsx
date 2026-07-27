'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { routing } from '@/lib/i18n/routing';

/**
 * Language switcher (PRD §11).
 *
 * Replaces the Phase 1 bare select. Switching preserves the current path via
 * next-intl's locale-aware router, so a customer reading a product page in Dari
 * lands on the same product in English rather than being sent home.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('common.language')}>
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {routing.locales.map((value) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => router.replace(pathname, { locale: value })}
            className={value === locale ? 'text-primary font-semibold' : undefined}
          >
            {t(`locales.${value}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
