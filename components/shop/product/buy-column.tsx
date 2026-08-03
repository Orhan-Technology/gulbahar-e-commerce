'use client';

import * as React from 'react';
import Image from 'next/image';

import { usePrefersReducedMotion } from '@/components/custom/stat-card';
import { ShareButton } from '@/components/shop/product/share-button';
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
 * REDUCED MOTION REMOVES THE ANIMATION, NOT THE FEATURE — and it used to do
 * the opposite. Asking for less motion turned off the stickiness AND the
 * condensed identity line, so a reader with "reduce animation" set (which is a
 * single switch in GNOME, and on by default in plenty of setups) got a plain
 * block that scrolled away and never said which product they were looking at.
 * That is not a motion preference being honoured, it is a feature being
 * withdrawn from the people most likely to want a stable target. The panel now
 * sticks and condenses for everyone; only the 200ms transition is dropped, so
 * the switch is instant rather than absent.
 *
 * CONDENSING IS GATED ON `lg` because that is where the column is sticky.
 * Below it the box scrolls away like any other block, and collapsing its
 * contents on the way past would hide the price of a product still on screen.
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
  const [wide, setWide] = React.useState(false);

  // Matches the `lg:` breakpoint the sticky positioning is gated on, so the
  // two cannot disagree about when this column is a sidebar.
  React.useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  React.useEffect(() => {
    const node = document.getElementById(anchorId);
    if (!node || !wide) return;

    /*
     * A sentinel at the TOP of the column rather than a scroll listener: the
     * observer fires twice per crossing instead of on every frame, and it needs
     * no reading of layout during a scroll.
     *
     * `rootMargin` pulls the trigger line down to where the column comes to
     * rest, so the switch happens exactly as the title disappears behind the
     * header rather than at the viewport edge. Read from the SAME custom
     * property the sticky offset uses — a hard-coded 96px here was how the
     * trigger and the resting position drifted apart in the first place.
     */
    const offset =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--sticky-offset'),
      ) * 16 || 120;

    const observer = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: `-${Math.round(offset)}px 0px 0px 0px`, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [anchorId, wide]);

  const collapsed = condensed && wide;

  return (
    /*
     * No `space-y` here on purpose. A collapsed section still occupies its
     * sibling margin, so three closed collapsibles would leave sixty pixels of
     * nothing above the button. The spacing lives INSIDE each collapsible
     * instead, where it collapses along with the content.
     */
    <div
      data-buy-column
      data-condensed={collapsed ? 'true' : 'false'}
      className={cn(className, 'lg:sticky lg:top-[var(--sticky-offset)]')}
    >
      {/* The condensed identity line — absent from the flow until it is needed. */}
      <Collapsible open={collapsed} instant={prefersReduced}>
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

      <Collapsible open={!collapsed} instant={prefersReduced}>
        <div className="space-y-5">
          {header}
          {shop}
        </div>
      </Collapsible>

      {children}

      <Collapsible open={!collapsed} instant={prefersReduced}>
        <div className="space-y-5">
          {/*
            SHARE SITS WITH THE PURCHASE CONTROLS, under the price and the
            add-to-cart row, because that is the moment someone decides to ask
            a second person before buying. It collapses with the rest of the
            secondary block: a reader who has scrolled past the top of the page
            is reading, not forwarding.

            The title comes from this component rather than from a prop on the
            page — it already has it for the condensed identity line, so the
            control needs nothing wired through.

            FROM `lg` UP ONLY. Below that the column is not a sidebar, it is the
            page, and a labelled share here became a third full-width bar under
            "add to cart" and "buy now". The buy panel renders it as an icon
            beside the wishlist heart at those widths instead.
          */}
          <ShareButton title={title} className="hidden w-full lg:inline-flex" />
          {extras}
        </div>
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
function Collapsible({
  open,
  instant,
  children,
}: {
  open: boolean;
  /** Reduced motion: switch states with no transition, but still switch. */
  instant?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid',
        !instant && 'transition-[grid-template-rows,opacity] duration-200 ease-out',
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
