'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Heart, ImageOff } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { PriceDisplay } from '@/components/custom/price-display';
import { RatingStars } from '@/components/custom/rating-stars';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { LOW_STOCK_BADGE_THRESHOLD } from '@/lib/listing';
import { discountFraction, formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export interface ProductCardProps {
  slug: string;
  title: string;
  shopName: string;
  /**
   * Floor the shop trades on. Rendered after the shop name — the mall is the
   * product here, and "which floor" is the thing a Gulbahar customer actually
   * navigates by (PRD §5.1).
   */
  shopFloor?: number | null;
  price: number;
  discountPrice?: number | null;
  rating?: number;
  reviewCount?: number;
  /** Path under /public, e.g. /uploads/seed/xyz-800.webp. */
  imagePath?: string | null;
  isSponsored?: boolean;
  isWishlisted?: boolean;
  /** Optimistic toggle supplied by the wishlist server action (Phase 5). */
  onToggleWishlist?: (next: boolean) => void;
  /** Drives the out-of-stock / low-stock treatment. */
  stock?: number;
  className?: string;
  /** Set true for above-the-fold cards so the hero row is not lazy-loaded. */
  priority?: boolean;
  /**
   * Suppresses the built-in heart. The storefront overlays its own
   * WishlistButton, which is wired to a server action and knows the viewer's
   * saved state; the built-in one is local-only and exists for the styleguide.
   */
  hideWishlist?: boolean;
  /**
   * The storefront's real wishlist control, rendered INSIDE the media panel.
   *
   * It used to be positioned over the card by ProductGrid, which was fine
   * until the panel started scaling on hover: an overlay outside the panel
   * stays put while the panel grows around it, leaving the heart stranded in
   * the middle of the enlarged photo. Passing it in makes it part of the thing
   * that transforms.
   */
  wishlistSlot?: React.ReactNode;
  /**
   * Where the hover pop-out grows FROM.
   *
   * A centred origin is right for a card with neighbours on both sides, but a
   * card at the end of a row grows straight into the page gutter and gets
   * clipped. Anchoring the outermost cards to their outer edge makes them
   * expand inwards instead, so the whole panel stays on screen. Physical
   * left/right chosen per direction — `transform-origin` has no logical
   * keyword, so this follows the same `ltr:`/`rtl:` pattern the gradients use.
   */
  edge?: 'start' | 'end';
}

/**
 * The storefront's workhorse card (PRD §10.4).
 *
 * BORDERLESS by design: the photo sits on a rounded tinted panel floating on
 * the page, with the text stacked beneath it and no container, border or
 * resting shadow. At five cards to a row a bordered box drew a grid of frames
 * that competed with the photography; the photos do the separating instead.
 *
 * THE HOVER is the reference design's signature move, and the one thing that
 * makes a dense grid feel alive: pointing at a card enlarges its media panel
 * to 1.4× and lifts it over its neighbours. Three details make it work rather
 * than merely happen:
 *
 *   - The PANEL scales, not the whole card. The title and price stay where
 *     they are at their own size, so a row does not visibly reflow and the
 *     text under the neighbouring cards stays readable.
 *   - `hover:z-30` is on the card ROOT, not the panel. A `position: relative`
 *     element with `z-index: auto` does not create a stacking context, so a
 *     z-index set on the panel would be resolved against the grid and lose to
 *     any card later in DOM order — the effect would work on the last card in
 *     a row and be silently painted over on every other one.
 *   - It is `sm:` and up only. Below that the grid is a horizontal scroller,
 *     where a scaled child is both clipped by the overflow and added to the
 *     scrollable width. Tailwind v4 also wraps `hover:` in `(hover: hover)`,
 *     so a touch device never fires it in the first place.
 *
 * The image box has explicit dimensions so there is zero layout shift between
 * skeleton and content (PRD §9.3).
 */
export function ProductCard({
  slug,
  title,
  shopName,
  shopFloor,
  price,
  discountPrice,
  rating,
  reviewCount,
  imagePath,
  isSponsored = false,
  isWishlisted = false,
  onToggleWishlist,
  stock,
  className,
  priority = false,
  hideWishlist = false,
  wishlistSlot,
  edge,
}: ProductCardProps) {
  const locale = useLocale();
  const t = useTranslations('product');
  const common = useTranslations('common');

  const [saved, setSaved] = React.useState(isWishlisted);
  // Keeps the heart from popping on first paint — only on user action.
  const [popping, setPopping] = React.useState(false);

  const fraction = discountFraction(price, discountPrice ?? null);
  const outOfStock = stock !== undefined && stock <= 0;
  /*
   * Scarcity, stated only when it is true. Three, not the dashboard's five: a
   * shopkeeper wants warning early enough to restock, a shopper only cares once
   * it is nearly gone, and a badge that fires at five sits on a third of the
   * catalogue and stops meaning anything.
   */
  const lowStock =
    stock !== undefined && stock > 0 && stock <= LOW_STOCK_BADGE_THRESHOLD;

  function toggleWishlist(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const next = !saved;
    setSaved(next);
    if (next) setPopping(true);
    onToggleWishlist?.(next);
  }

  return (
    /*
     * `pressable` on the ROOT, not on the media panel: the panel already owns a
     * `scale` for its hover pop-out, and two rules animating one property on one
     * element means whichever wins the cascade silently cancels the other. The
     * card gives as a whole, which is also what a native list does.
     */
    <div className={cn('pressable group relative flex flex-col gap-3 hover:z-30', className)}>
      {/*
        `duration-[420ms]` is inside the 500ms decorative budget, not the
        300ms feedback one: nothing is waiting on a hover, and the unhurried
        settle is the whole character of the gesture (PRD §10.6, revised).

        `sm:group-hover:z-20` is not decoration. Scaling gives the panel a
        stacking context of its own, which would trap the heart inside it
        BELOW the stretched link — leaving the wishlist button unclickable
        for exactly as long as the pointer is on the card.
      */}
      <div
        className={cn(
          'rounded-media relative aspect-square overflow-hidden bg-neutral-100',
          edge === 'start'
            ? 'ltr:origin-left rtl:origin-right'
            : edge === 'end'
              ? 'ltr:origin-right rtl:origin-left'
              : 'origin-center',
          // `scale`, not `transform`: Tailwind v4 compiles scale-* to the
          // standalone `scale` property, so a transition list naming only
          // `transform` animates nothing and the panel snaps to full size.
          'transition-[scale,box-shadow] duration-[420ms] ease-[var(--ease-settle)]',
          'sm:group-hover:shadow-overlay sm:group-hover:z-20 sm:group-hover:scale-[1.4]',
        )}
      >
        {imagePath ? (
          <Image
            src={imagePath}
            alt={title}
            fill
            // The panel grows to 1.4x on hover, so ask for the larger source
            // up front rather than letting a 240px image be scaled up.
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 340px"
            priority={priority}
            className={cn('object-cover', outOfStock && 'opacity-60')}
          />
        ) : (
          <div className="from-primary-50 flex h-full w-full items-center justify-center bg-linear-to-br to-neutral-100 text-neutral-400">
            <ImageOff className="h-8 w-8" aria-hidden />
          </div>
        )}

        {/*
          Both controls sit at z-20 — above the stretched link below, which is
          what keeps them clickable through the card-wide click target.
        */}
        {wishlistSlot && <div className="absolute end-2.5 top-2.5 z-20">{wishlistSlot}</div>}

        {!hideWishlist && !wishlistSlot && (
          <button
            type="button"
            onClick={toggleWishlist}
            onAnimationEnd={() => setPopping(false)}
            aria-pressed={saved}
            aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
            className="rounded-pill bg-card shadow-card focus-visible:ring-ring absolute end-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center transition-colors duration-150 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Heart
              className={cn(
                'h-4 w-4 transition-colors duration-150',
                saved ? 'fill-danger text-danger' : 'text-neutral-500',
                popping && 'animate-heart-pop',
              )}
            />
          </button>
        )}

        {/* Ribbons sit at the inline start so they never collide with the heart. */}
        <div className="absolute start-2.5 top-2.5 z-20 flex flex-col items-start gap-1">
          {fraction !== null && (
            <span className="rounded-pill bg-accent text-accent-foreground text-2xs px-2.5 py-1.5 font-bold">
              {t('percentOff', { percent: formatPercent(fraction, locale) })}
            </span>
          )}
          {isSponsored && <SponsoredBadge />}
        </div>

        {outOfStock && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-neutral-900/75 py-1 text-center text-xs font-medium text-neutral-50">
            {t('outOfStock')}
          </div>
        )}

        {lowStock && (
          <div className="bg-warning-bg text-warning absolute inset-x-0 bottom-0 z-20 py-1 text-center text-xs font-semibold">
            {t('onlyLeft', {
              // `n` pluralises, `count` renders — see lib/db/queries/dashboard.ts.
              n: stock!,
              count: formatNumber(stock!, locale),
            })}
          </div>
        )}
      </div>

      {/*
       * Two lines reserved whether the title needs them or not, so a row of
       * cards keeps its price and shop lines aligned across differing title
       * lengths — a ragged baseline is what makes a dense grid look untidy.
       *
       * The link is STRETCHED over the whole card by its ::after rather than
       * wrapping it. The card has to contain a button — the wishlist heart —
       * and a button inside an anchor is invalid HTML that the parser hoists
       * out, which surfaces as a hydration error nowhere near its cause.
       */}
      <h3 className="clamp-2 text-foreground min-h-[2.625rem] text-base leading-normal font-normal">
        <Link
          href={`/products/${slug}`}
          className="group-hover:text-primary transition-colors duration-150 after:absolute after:inset-0 after:z-10 after:content-['']"
        >
          {title}
        </Link>
      </h3>

      {/*
       * `reserveSpace`, not a row of empty stars. An unrated product now
       * renders BLANK space of the same height: hiding the row outright
       * shortened those cards by a line and threw the price and shop lines out
       * of alignment across a five-card row, but five grey stars and a "(۰)"
       * report an absence as though it were a score — which is how a young
       * catalogue talks itself down.
       */}
      <RatingStars value={rating ?? 0} count={reviewCount} size="sm" reserveSpace />

      <PriceDisplay price={price} discountPrice={discountPrice} size="md" />

      <span className="text-2xs truncate text-neutral-500">
        {shopFloor === undefined || shopFloor === null
          ? shopName
          : `${shopName} · ${common('floorName', { floor: shopFloor })}`}
      </span>
    </div>
  );
}

export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Matches the 1:1 tile and the reserved two-line title exactly, so
          nothing shifts on swap. */}
      <Skeleton className="rounded-media aspect-square w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and ProductCard.Skeleton reads as undefined. Server code
 * must import ProductCardSkeleton directly.
 */
ProductCard.Skeleton = ProductCardSkeleton;
