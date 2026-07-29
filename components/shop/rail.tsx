'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { localeDirection } from '@/lib/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The horizontal rail (PRD §5.1).
 *
 * THE CORE COMPLAINT it fixes: every "row" on the home page was a five-column
 * grid above `sm`. There was no sixth item — not hidden, not scrollable, simply
 * absent until you left the page through "view all". A marketplace row is a
 * promise that there is more; a grid of exactly five is a promise it cannot
 * keep.
 *
 * Native scrolling, no scroll library. `scroll-snap` does the alignment, the
 * browser does the momentum, and the arrows are a `scrollBy` — which means the
 * rail works with JavaScript disabled (drag and swipe still function; only the
 * arrows are inert) and costs nothing on the main thread while idle.
 *
 * PEEK is the affordance. Card widths are set so the last visible card is cut
 * by roughly a sixth at the container edge. A row that ends flush looks
 * finished; a row with a sliced card is visibly unfinished, which is the entire
 * signal. The fade masks at each edge reinforce it and retract when you reach
 * that end.
 *
 * RTL is the part that breaks quietly. In a right-to-left container the scroll
 * origin is the RIGHT edge and `scrollLeft` runs NEGATIVE as you advance —
 * engines historically disagreed about this and some still do, so nothing here
 * compares `scrollLeft` to zero directly: position is read through
 * `Math.abs()`, and "next" is expressed as a signed delta derived from the
 * document direction rather than assumed. The arrow icons mirror too, so the
 * button pointing at the reading direction is always the one that advances.
 */

/**
 * Card widths per breakpoint, chosen so the row always ends mid-card.
 *
 * Five-and-a-bit at desktop, three-and-a-bit at tablet, two-and-a-bit on a
 * phone — the fraction is the point. Applied to the rail's CHILDREN so any
 * content can go in a rail without knowing it is in one.
 */
const SIZES = {
  /** Product and shop cards. */
  card: '[&>*]:w-[44%] sm:[&>*]:w-[30%] lg:[&>*]:w-[18.5%]',
  /** Category circles and other small tiles. */
  tile: '[&>*]:w-[22%] sm:[&>*]:w-[14%] lg:[&>*]:w-[11%]',
  /** Wide promotional panels. */
  panel: '[&>*]:w-[82%] sm:[&>*]:w-[46%] lg:[&>*]:w-[31%]',
} as const;

export function Rail({
  children,
  label,
  size = 'card',
  className,
}: {
  children: React.ReactNode;
  /** Names the region for screen readers — pass the section's own heading. */
  label: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const locale = useLocale();
  const isRtl = localeDirection(locale) === 'rtl';
  const ref = React.useRef<HTMLDivElement>(null);

  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(false);

  const measure = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // Absolute, because RTL scroll positions are negative in every current
    // engine and were positive in some older ones. Neither sign is meaningful
    // here; the distance from the logical start is.
    const position = Math.abs(node.scrollLeft);
    const max = node.scrollWidth - node.clientWidth;
    setAtStart(position <= 1);
    setAtEnd(position >= max - 1);
  }, []);

  React.useEffect(() => {
    measure();
    const node = ref.current;
    if (!node) return;

    // A resize changes how much is visible, so the end state changes with it.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  function page(direction: 1 | -1) {
    const node = ref.current;
    if (!node) return;
    // One viewport width, less a card's worth of overlap so the card that was
    // half-visible ends up fully visible rather than skipped.
    const distance = node.clientWidth * 0.85;
    node.scrollBy({ left: direction * distance * (isRtl ? -1 : 1), behavior: 'smooth' });
  }

  const Prev = isRtl ? ChevronRight : ChevronLeft;
  const Next = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className={cn('group/rail relative', className)} role="region" aria-label={label}>
      <div
        ref={ref}
        onScroll={measure}
        className={cn(
          // `-mx-4 px-4` lets the rail bleed to the screen edge on a phone while
          // its first card still lines up with the page gutter.
          '-mx-4 flex snap-x scrollbar-none gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0',
          '[&>*]:shrink-0 [&>*]:snap-start',
          SIZES[size],
        )}
      >
        {children}
      </div>

      {/*
        Edge fades. Purely an affordance, so they are pointer-transparent and
        retract at the end they belong to. Physical inset-* rather than logical:
        a gradient has no logical direction (CLAUDE.md), and these two are
        mirror images, so naming them by side is the honest spelling.
      */}
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

      <RailButton side="start" icon={Prev} disabled={atStart} onClick={() => page(-1)} />
      <RailButton side="end" icon={Next} disabled={atEnd} onClick={() => page(1)} />
    </div>
  );
}

/**
 * A rail arrow.
 *
 * Hidden until the rail is hovered on a fine pointer, and ALWAYS visible where
 * there is no hover — a touch device never reveals a hover-gated control, and
 * on a coarse pointer the arrows are the accessible alternative to a swipe for
 * anyone who cannot make one.
 */
function RailButton({
  side,
  icon: Icon,
  disabled,
  onClick,
}: {
  side: 'start' | 'end';
  icon: typeof ChevronLeft;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      // The cards are already in the tab order and scrolling follows focus, so
      // these would be two extra stops on the way into every row.
      aria-hidden
      className={cn(
        pressable,
        'rounded-pill bg-card shadow-overlay absolute top-[38%] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center transition-[opacity,scale] duration-150 ease-out sm:flex',
        side === 'start' ? 'start-0 -ms-1' : 'end-0 -me-1',
        disabled
          ? 'pointer-events-none opacity-0'
          : 'opacity-0 group-hover/rail:opacity-100 [@media(hover:none)]:opacity-100',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
