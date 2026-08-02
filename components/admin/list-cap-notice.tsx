import { getLocale, getTranslations } from 'next-intl/server';
import { Info } from 'lucide-react';

import { formatNumber } from '@/lib/format';

/**
 * "You are looking at the first N rows" (PRD §10.5).
 *
 * THE POINT IS HONESTY, not pagination. Three of the console's lists — orders,
 * users, products — took the newest 200, 200 and 100 rows and then rendered
 * them as if that were everything. Nothing on the screen said otherwise, so a
 * mall with 240 customers showed 200 and an admin scrolling to the bottom
 * concluded they had seen the lot. Silent truncation is worse than a short
 * list: it produces confident wrong answers.
 *
 * A caption rather than a "load more" button, because every one of these
 * screens already has the right tool beside it — search and filters that narrow
 * the set server-side — and a second page of two hundred unsorted rows is not
 * how anyone finds an order. The caption says so.
 *
 * Renders NOTHING when the list fits, which is the normal case: a permanent
 * disclaimer teaches people to stop reading captions.
 */
export async function ListCapNotice({ shown, hasMore }: { shown: number; hasMore: boolean }) {
  if (!hasMore) return null;

  const locale = await getLocale();
  const t = await getTranslations('console.cap');

  return (
    <p className="rounded-card border-border bg-card text-muted-foreground flex items-start gap-2 border p-3 text-xs">
      <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t('body', { count: formatNumber(shown, locale) })}</span>
    </p>
  );
}
