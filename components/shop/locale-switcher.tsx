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
import { routing, type AppLocale } from '@/lib/i18n/routing';

/**
 * Language switcher (PRD §11).
 *
 * Replaces the Phase 1 bare select. Switching preserves the current path via
 * next-intl's locale-aware router, so a customer reading a product page in Dari
 * lands on the same product in English rather than being sent home.
 *
 * WHICH locales it offers is a setting, not the routing table (A4). `routing`
 * lists every locale the app has structure for, and that includes Pashto —
 * whose strings are deferred (PRD §11). Offering it would hand a visitor a
 * half-translated storefront, so the published set comes from
 * `platform_settings` and the caller passes it down; the routing table remains
 * the fallback for surfaces with no database read of their own.
 */
export function LocaleSwitcher({
  className,
  locales = routing.locales,
}: {
  className?: string;
  locales?: readonly AppLocale[];
}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* `className` exists for the one dark surface that hosts this — the
            shop panel's green header, where the ghost button's ink disappears. */}
        <Button variant="ghost" size="icon" aria-label={t('common.language')} className={className}>
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((value) => (
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
