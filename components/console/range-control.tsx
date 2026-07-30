'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { pressable } from '@/components/motion/pressable';
import { CONSOLE_RANGES, type ConsoleRangeKey } from '@/lib/console-range';
import { cn } from '@/lib/utils';

/**
 * The console's date range control (Prompt C3).
 *
 * Writes `?range=` and lets the server re-render. It deliberately does NOT hold
 * the range in React state: the URL is the state, which is what makes the view
 * shareable and the back button work, and a second copy in a hook is the usual
 * way those two drift apart.
 *
 * `next/navigation`'s router rather than the locale-aware one, because this
 * only ever changes a search parameter on the page it is already on — there is
 * no path to localise.
 */
export function RangeControl({ current }: { current: ConsoleRangeKey }) {
  const t = useTranslations('console.range');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(key: ConsoleRangeKey) {
    const next = new URLSearchParams(params.toString());
    next.set('range', key);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div
      /*
       * A stable hook for the audit. The buttons write the URL on click rather
       * than being links, so a check cannot look for "?range=" in the markup —
       * and the visible labels are translated, which next-intl ships to every
       * page whether the control rendered or not (CLAUDE.md).
       */
      data-range-control=""
      className="rounded-pill border-border bg-card inline-flex items-center gap-0.5 border p-0.5"
      role="group"
      aria-label={t('label')}
    >
      {CONSOLE_RANGES.map((range) => (
        <button
          key={range.key}
          type="button"
          onClick={() => select(range.key)}
          aria-pressed={range.key === current}
          className={cn(
            pressable,
            'rounded-pill px-3 py-1 text-xs font-medium transition-[background-color,color,scale] duration-150 ease-out',
            range.key === current
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-neutral-600 hover:bg-neutral-100',
          )}
        >
          {t(range.key)}
        </button>
      ))}
    </div>
  );
}
