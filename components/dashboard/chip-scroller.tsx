'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A horizontally scrolling row of chips or tabs that BRINGS THE ACTIVE ONE INTO
 * VIEW, and says when there is more of it off-screen.
 *
 * The bug this fixes was invisible on a desktop and total on a phone: opening
 * `/dashboard/products?status=archived` at 390px rendered the archive chip
 * seventh in a row six chips wide, so the screen showed a filtered list with
 * every visible chip unselected — the one piece of state explaining why the
 * catalogue looked empty was scrolled out of the viewport. Same on the reports
 * tab row for «زمان سفارش‌ها».
 *
 * IMPERATIVE, WITHOUT REACT STATE, on purpose:
 *
 *   - the scroll position is not rendered from, so holding it in state would
 *     re-render the row on every scroll event for nothing;
 *   - setState inside an effect is what React 19's lint rule forbids, and the
 *     fade has to be computed after layout;
 *   - `children` are server-rendered links, so this component must not need to
 *     know anything about them beyond a `data-chip-active` marker.
 *
 * The fade is a mask on the sides that actually have hidden content, recomputed
 * on scroll and on resize. It is applied as an inline style rather than an
 * arbitrary Tailwind mask utility because it is computed, and because the
 * project bans arbitrary values (CLAUDE.md).
 */
const FADE = 24;

export function ChipScroller({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const rtl = getComputedStyle(element).direction === 'rtl';

    function paintFade() {
      if (!element) return;
      const max = element.scrollWidth - element.clientWidth;
      if (max <= 1) {
        element.style.maskImage = '';
        return;
      }

      /*
       * `scrollLeft` is negative in RTL in every current browser, so the
       * DISTANCE from the start is its absolute value in both directions.
       * Which physical edge that hides content behind is then a question of
       * direction, and getting it backwards fades the wrong side — which reads
       * as a rendering artefact rather than as an affordance.
       */
      const fromStart = Math.abs(element.scrollLeft);
      const hiddenAtStart = fromStart > 1;
      const hiddenAtEnd = fromStart < max - 1;
      const left = rtl ? hiddenAtEnd : hiddenAtStart;
      const right = rtl ? hiddenAtStart : hiddenAtEnd;

      element.style.maskImage = `linear-gradient(to right, ${
        left ? `transparent, black ${FADE}px` : 'black, black'
      }, ${right ? `black calc(100% - ${FADE}px), transparent` : 'black, black'})`;
    }

    // Centre the active chip. `block: 'nearest'` so a row low on the page does
    // not drag the whole document sideways or vertically on load.
    const active = element.querySelector('[data-chip-active="true"]');
    if (active) {
      const chip = active.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      if (chip.left < box.left || chip.right > box.right) {
        active.scrollIntoView({ inline: 'center', block: 'nearest' });
      }
    }

    paintFade();
    const observer = new ResizeObserver(paintFade);
    observer.observe(element);
    element.addEventListener('scroll', paintFade, { passive: true });

    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', paintFade);
    };
  }, []);

  return (
    <div ref={ref} className={cn('scrollbar-none overflow-x-auto', className)}>
      {children}
    </div>
  );
}
