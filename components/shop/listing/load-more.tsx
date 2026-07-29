'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { Link, usePathname } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * "Load more" over numbered pagination (PRD §5.1).
 *
 * Numbered pages are a filing-cabinet idiom: nobody browsing a marketplace
 * wants page four, they want more of what they are already looking at. But the
 * URL stays pageable underneath — this renders a real `<Link>` to `?page=N+1`,
 * so the button works with JavaScript off, right-click opens the next page, and
 * a crawler can walk the whole listing. It is a progressive enhancement of
 * pagination rather than a replacement for it.
 *
 * The remaining count is on the button because "load more" alone does not say
 * whether that means eight products or eight hundred.
 */
export function LoadMore({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const t = useTranslations('listing');
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();

  if (page >= pageCount) return null;

  const next = new URLSearchParams(params.toString());
  next.set('page', String(page + 1));

  const shown = Math.min(page * pageSize, total);
  const remaining = total - shown;

  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <p className="text-muted-foreground text-xs">
        {t('shownOf', {
          shown: formatNumber(shown, locale),
          total: formatNumber(total, locale),
        })}
      </p>
      <Button asChild variant="outline" className={cn(pressable, 'min-w-48')}>
        <Link href={`${pathname}?${next.toString()}`} scroll={false}>
          {t('loadMore', {
            // `n` pluralises, `count` renders — see lib/db/queries/dashboard.ts.
            n: remaining,
            count: formatNumber(Math.min(remaining, pageSize), locale),
          })}
          <ChevronDown />
        </Link>
      </Button>
    </div>
  );
}
