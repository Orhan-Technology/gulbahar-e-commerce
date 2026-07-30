'use client';

import * as React from 'react';
import Image from 'next/image';

import { usePrefersReducedMotion } from '@/components/custom/stat-card';
import { cn } from '@/lib/utils';

/**
 * The buy box that follows you down the page (Prompt P2).
 *
 * On desktop the purchase block sticks while the buyer reads specifications,
 * reviews and rails — the one thing they came to do stays one click away
 * throughout. Once the top of the column has scrolled past, it CONDENSES to the
 * four things that matter at that point: what it is, what it costs, how many,
 * and the button.
 *
 * The controls themselves NEVER UNMOUNT. `children` — the quantity stepper, the
 * add-to-cart button, the variant chips — is rendered once and stays in the
 * tree; only the surrounding context collapses. Swapping in a separate
 * "condensed panel" component would reset the chosen quantity and any selected
 * variant the moment the page scrolled, which is a bug the user would blame on
 * the shop.
 *
 * The collapse animates `grid-template-rows` and opacity together in 200ms,
 * which is the reference's timing and inside our 300ms feedback budget.
 *
 * REDUCED MOTION drops both behaviours, not just the animation: the column
 * becomes a plain static block. A sticky element that jumps between two layouts
 * with no transition is worse than one that does not move at all.
 *
 * STICKY, NOT FIXED — and it ends where its grid does, which is above the
 * footer, so it can never cover it.
 */
export function BuyColumn({
  anchorId,
  className,
  thumbnail,
  title,
  header,
  shop,
  extras,
  children,
}: {
  /**
   * Id of an element in the NORMAL FLOW whose crossing the top of the viewport
   * means "the buy box has been left behind".
   *
   * It cannot be a sentinel inside this component: everything here is inside
   * the sticky element, which by definition never scrolls out of view, so an
   * observer on it would never fire. And it cannot be a sibling wrapper either
   * — wrapping the sticky div in a non-sticky parent makes THAT the containing
   * block, and the column would unstick the moment its own content ended.
   */
  anchorId: string;
  /** Grid placement from the page — the column's position is the page's call. */
  className?: string;
  thumbnail: string | null;
  title: string;
  /** Title, brand and rating — collapses when condensed. */
  header: React.ReactNode;
  /** The shop card — collapses when condensed. */
  shop: React.ReactNode;
  /** Fulfilment and help — collapses when condensed. */
  extras: React.ReactNode;
  /** Price, stock, variants, quantity and the buttons. Always mounted. */
  children: React.ReactNode;
}) {
  const prefersReduced = usePrefersReducedMotion();
  const [condensed, setCondensed] = React.useState(false);

  React.useEffect(() => {
    const node = document.getElementById(anchorId);
    if (!node || prefersReduced) return;

    /*
     * A sentinel at the TOP of the column rather than a scroll listener: the
     * observer fires twice per crossing instead of on every frame, and it needs
     * no reading of layout during a scroll.
     *
     * `rootMargin` pulls the trigger line down to just under the sticky site
     * header, so the switch happens when the title actually disappears behind
     * it rather than at the viewport edge.
     */
    const observer = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: '-96px 0px 0px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [anchorId, prefersReduced]);

  const collapsed = condensed && !prefersReduced;

  return (
    /*
     * No `space-y` here on purpose. A collapsed section still occupies its
     * sibling margin, so three closed collapsibles would leave sixty pixels of
     * nothing above the button. The spacing lives INSIDE each collapsible
     * instead, where it collapses along with the content.
     */
    <div className={cn(className, !prefersReduced && 'lg:sticky lg:top-24')}>
      {/* The condensed identity line — absent from the flow until it is needed. */}
      <Collapsible open={collapsed}>
        <div className="rounded-card border-border bg-card flex items-center gap-3 border p-3">
          <span className="rounded-control relative h-12 w-12 shrink-0 overflow-hidden bg-neutral-100">
            {thumbnail && (
              <Image src={thumbnail} alt="" fill sizes="48px" className="object-cover" />
            )}
          </span>
          {/* Identity only — no price. The price block below is always mounted
              and never scrolls away, so repeating it here would put the same
              number on screen twice, three centimetres apart. */}
          <span className="clamp-1 min-w-0 flex-1 text-sm font-semibold">{title}</span>
        </div>
      </Collapsible>

      <Collapsible open={!collapsed}>
        <div className="space-y-5">
          {header}
          {shop}
        </div>
      </Collapsible>



      {children}

      <Collapsible open={!collapsed}>
        <div className="space-y-5">{extras}</div>
      </Collapsible>
    </div>
  );
}

/**
 * Height + opacity in one 200ms transition.
 *
 * `grid-template-rows` from `0fr` to `1fr` is the only way to animate to an
 * intrinsic height without measuring it, and the inner `overflow-hidden` is what
 * makes the zero-height state actually clip.
 */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      aria-hidden={!open}
    >
      {/* The pb lives inside the clipped box, so the gap disappears with the
          content instead of leaving a stripe of nothing behind. */}
      <div className="overflow-hidden">
        <div className="pb-5">{children}</div>
      </div>
    </div>
  );
}
