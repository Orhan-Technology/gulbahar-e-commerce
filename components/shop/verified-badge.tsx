'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The verified badge (Prompt C7).
 *
 * IT EXPLAINS ITSELF. A tick with no explanation is a trust mark the reader has
 * to guess at, and every marketplace's tick means something different — some
 * verify an email, some a payment method, some nothing at all. Ours means one
 * specific thing that only a landlord can say, so it says it: mall management
 * has confirmed this is a registered business operating at this unit in
 * Gulbahar Center.
 *
 * UNVERIFIED SHOWS NOTHING. Never a red cross, never "not verified" — most
 * shops in a real mall have not been through this, and marking them as failures
 * would turn a positive signal into a punishment for paperwork nobody asked
 * them for yet.
 */
export function VerifiedBadge({
  verifiedAt,
  size = 'md',
  className,
}: {
  /** ISO string, or null for an unverified shop — which renders nothing. */
  verifiedAt: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations('verification');
  const locale = useLocale();

  if (!verifiedAt) return null;

  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('badgeLabel')}
          className={cn(
            'text-primary hover:text-primary-700 inline-flex shrink-0 items-center transition-colors duration-150',
            className,
          )}
          // A badge inside a card that is itself a link: without this the
          // popover never opens because the card navigates first.
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <BadgeCheck className={icon} aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-72 space-y-1.5 text-sm" align="start">
        <p className="flex items-center gap-1.5 font-semibold">
          <BadgeCheck className="text-primary h-4 w-4" aria-hidden />
          {t('popoverTitle')}
        </p>
        <p className="text-muted-foreground leading-relaxed">{t('popoverBody')}</p>
        <p className="text-2xs text-neutral-500">
          {t('verifiedOn', { date: formatDate(verifiedAt, locale) })}
        </p>
      </PopoverContent>
    </Popover>
  );
}
