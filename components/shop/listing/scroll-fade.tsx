'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A horizontal scroller that says it scrolls.
 *
 * The RAILS have this — a gradient at each end that retracts once you reach it —
 * and every other overflowing row in the storefront did not. The floor map's
 * category chips are the clearest case: eleven chips in a row that has to clip
 * somewhere, and the clip landed mid-word with nothing to suggest there was
 * more. A row that ends flush against the container looks finished; a row that
 * fades looks cut off on purpose.
 *
 * Not merged into `Rail`, which sizes its children into card-width columns —
 * this one imposes nothing on what goes in it, so a row of pills stays a row of
 * pills.
 *
 * RTL is the part that breaks quietly, and the rule is the one Rail documents:
 * in a right-to-left container the scroll origin is the right edge and
 * `scrollLeft` runs negative, so position is read through Math.abs() and never
 * compared to zero directly. The fades themselves are logical (`start`/`end`),
 * so they mirror with the document.
 */
export function ScrollFade({
  children,
  className,
  scrollerClassName,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  scrollerClassName?: string;
  /** Names the region for screen readers, like Rail's. */
  label?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(true);

  const measure = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const position = Math.abs(node.scrollLeft);
    const max = node.scrollWidth - node.clientWidth;
    setAtStart(position <= 1);
    // A row that does not overflow is at BOTH ends, so neither fade paints.
    setAtEnd(position >= max - 1);
  }, []);

  React.useEffect(() => {
    measure();
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        onScroll={measure}
        role={label ? 'region' : undefined}
        aria-label={label}
        className={cn(
          '-mx-4 flex snap-x scrollbar-none gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0',
          scrollerClassName,
        )}
      >
        {children}
      </div>

      {/* Physical `bg-linear-to-*` with a logical inset: a gradient has no
          logical variant (CLAUDE.md), so the pair is spelled by side and
          swapped under `rtl:`. */}
      <span
        aria-hidden
        className={cn(
          'from-background pointer-events-none absolute inset-y-0 start-0 w-8 bg-linear-to-r to-transparent transition-opacity duration-150 rtl:bg-linear-to-l',
          atStart ? 'opacity-0' : 'opacity-100',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'from-background pointer-events-none absolute inset-y-0 end-0 w-8 bg-linear-to-l to-transparent transition-opacity duration-150 rtl:bg-linear-to-r',
          atEnd ? 'opacity-0' : 'opacity-100',
        )}
      />
    </div>
  );
}
