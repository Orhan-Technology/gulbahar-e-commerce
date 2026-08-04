'use client';

import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { cn } from '@/lib/utils';

/**
 * The paid-placement disclosure, as a badge and a question mark (PRD §8.4).
 *
 * It used to be a full sentence in the flow of the page — «این محصولات جایگاه
 * تبلیغاتی خریده‌اند — ترتیب نتایج عادی تغییر نکرده است» — sitting between the
 * filter chips and the first row of results on the screen a shopper reaches
 * most often. Two clauses of policy is the wrong shape for that position: it is
 * read once, by nobody, and thereafter it is a line of grey text pushing the
 * goods down.
 *
 * NONE OF THE HONESTY IS LOST, and that is the constraint this component is
 * built around. The disclosure is a promise, not decoration, so the words are
 * unchanged and the badge — which is the part that must be visible without any
 * interaction, because it is what distinguishes a paid result from an organic
 * one — still sits in the flow. What moves behind a tap is the EXPLANATION of
 * the badge, which is the part a reader goes looking for rather than the part
 * they need pushed at them.
 *
 * The trigger is a real button with a real label: an `ⓘ` that only works as a
 * hover tooltip is a disclosure that does not exist on a phone, which is most
 * of this audience.
 */
export function SponsoredNote({ className }: { className?: string }) {
  const t = useTranslations('listing');

  return (
    <p className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <SponsoredBadge tone="inline" />
      <Popover>
        <PopoverTrigger
          aria-label={t('promotedNoteLabel')}
          className="rounded-pill focus-visible:ring-ring inline-flex h-6 w-6 items-center justify-center text-neutral-500 transition-colors duration-150 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Info className="h-4 w-4" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="max-w-xs text-xs leading-relaxed">
          {t('promotedNote')}
        </PopoverContent>
      </Popover>
    </p>
  );
}
