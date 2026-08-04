'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Heart, ImageOff } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { BidiText } from '@/components/custom/bidi-text';
import { PriceDisplay } from '@/components/custom/price-display';
import { RatingStars } from '@/components/custom/rating-stars';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { LOW_STOCK_BADGE_THRESHOLD } from '@/lib/listing';
import { MIN_RATING_REVIEWS } from '@/lib/ratings';
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
   * A quick add-to-cart control, rendered inside the media panel at the
   * opposite corner from the heart.
   *
   * Passed in for the same reason the heart is: the caller owns what the
   * control DOES — adding to a cart needs an action and a toast — while the
   * card owns where it sits.
   */
  quickAddSlot?: React.ReactNode;
}

/**
 * The storefront's workhorse card (PRD §10.4).
 *
 * BORDERLESS by design: the photo sits on a rounded tinted panel floating on
 * the page, with the text stacked beneath it and no container, border or
 * resting shadow. At five cards to a row a bordered box drew a grid of frames
 * that competed with the photography; the photos do the separating instead.
 *
 * THE HOVER IS A LIFT, NOT A MAGNIFICATION. The media panel used to scale to
 * 1.4× and rise over its neighbours, which was the reference design's signature
 * move and was removed on request: enlarging the photo under the pointer moves
 * the thing you are aiming at, covers the two cards beside it, and on a dense
 * grid makes browsing feel unsteady. What is left is a shadow — the card reads
 * as raised without anything moving.
 *
 * Nothing else needs to defend itself now that the panel holds still: no
 * transform origin per position in the row, no z-index lift to escape the
 * stacking context scaling created, and no page-level overflow containment for
 * a card growing past the gutter.
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
  quickAddSlot,
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
  /*
   * Mirrors RatingStars' own test rather than assuming a count is present: the
   * styleguide renders a card with a rating and no count, and treating that as
   * unrated would stamp «جدید» over a product that has a score to show.
   */
  const unrated =
    reviewCount !== undefined ? reviewCount < MIN_RATING_REVIEWS : (rating ?? 0) === 0;

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
     * `pressable` on the ROOT rather than the media panel: the card gives as a
     * whole when pressed, which is what a native list does.
     */
    <div className={cn('pressable group relative flex flex-col gap-3', className)}>
      {/*
        200ms, inside the feedback budget: with nothing moving, a slow shadow
        is just a shadow arriving late.

        `sm:` and up only, as before — Tailwind v4 wraps `hover:` in
        `(hover: hover)`, so a touch device never fires it anyway.
      */}
      <div
        className={cn(
          'rounded-media relative aspect-square overflow-hidden bg-neutral-100',
          'transition-[box-shadow] duration-200 ease-out',
          'sm:group-hover:shadow-overlay',
        )}
      >
        {imagePath ? (
          <Image
            src={imagePath}
            alt={title}
            fill
            // Comfortably above the panel's rendered width at each breakpoint:
            // the card is the densest photography on the site and a source cut
            // too fine shows it first.
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 340px"
            priority={priority}
            // Desaturate AND dim. Opacity alone made a bright photo look like a
            // rendering fault rather than like something unavailable; grayscale
            // is the part that reads as "not for sale".
            className={cn('object-cover', outOfStock && 'opacity-60 grayscale')}
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

        {quickAddSlot}

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
          {/* NOT WHEN IT CANNOT BE BOUGHT. "۷٪ تخفیف" over a card stamped
              «موجود نیست» is the card arguing with itself, and the discount is
              the half that is not actionable. The out-of-stock treatment stays;
              only the promotion goes. */}
          {fraction !== null && !outOfStock && (
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
      {/*
       * `text-balance` + <bdi>, because a mixed-script title is the one that
       * wraps badly: «سامسونگ گلکسی ۱۲۸ A54 گیگابایت» broke around the Latin
       * token on a 390px screen and left it alone on the second line. Balancing
       * evens the two lines so the break lands between words, and the isolation
       * keeps the token where the markup put it either way.
       */}
      <h3 className="clamp-2 text-foreground min-h-[2.625rem] text-base leading-normal font-normal text-balance">
        <Link
          href={`/products/${slug}`}
          className="group-hover:text-primary transition-colors duration-150 after:absolute after:inset-0 after:z-10 after:content-['']"
        >
          <BidiText text={title} />
        </Link>
      </h3>

      {/*
       * `reserveSpace`, not a row of empty stars. An unrated product now
       * renders BLANK space of the same height: hiding the row outright
       * shortened those cards by a line and threw the price and shop lines out
       * of alignment across a five-card row, but five grey stars and a "(۰)"
       * report an absence as though it were a score — which is how a young
       * catalogue talks itself down.
       *
       * `minCount` extends that to the thin evidence a young catalogue
       * actually has: a single review draws five near-empty outlines and a
       * "۱", which across a grid reads as a shop nobody buys from. Below the
       * threshold the row stays blank; at three it is a score worth reading.
       * Set HERE rather than in RatingStars' default so the review list and the
       * composer, where one rating IS the subject, keep drawing it.
       */}
      {/*
       * …and where the row would be blank, one word instead of none.
       *
       * Silence was the honest answer to "we have no score", but it is not the
       * only true thing about the product: it is NEW. A blank line where every
       * neighbouring card carries stars reads as a card that failed to load
       * something, so the reader supplies the missing meaning themselves and it
       * is never a flattering one. «جدید» is the same absence, said out loud —
       * and it is the reading a shopper is inclined to reward rather than skip.
       *
       * Below MIN_RATING_REVIEWS rather than at zero reviews exactly, so the
       * chip covers the whole span where the stars are withheld and the row is
       * never empty. Neutral, not blue: the chip is not pressable, and not
       * amber either, because amber is reserved for opinion and this is the
       * absence of one.
       */}
      {unrated ? (
        <span className="inline-flex h-5 items-center">
          <span className="rounded-pill border-border text-2xs text-muted-foreground border px-2 py-0.5 font-medium">
            {t('newBadge')}
          </span>
        </span>
      ) : (
        <RatingStars
          value={rating ?? 0}
          count={reviewCount}
          size="sm"
          reserveSpace
          minCount={MIN_RATING_REVIEWS}
        />
      )}

      <PriceDisplay price={price} discountPrice={discountPrice} size="md" />

      {/*
       * THE LOCATION LINE IS A WAY IN, not a caption.
       *
       * «طبقه اول» under a price is the one fact on this card that no other
       * marketplace can print, and it was inert text. It now opens the mall
       * plan at that floor — the same panel the product page's sheet shows,
       * reached through the page that already draws it.
       *
       * A LINK TO /floors RATHER THAN A SHEET, and that is a cost decision
       * rather than a preference. A sheet needs the floor's units, and a grid
       * renders twenty-four of these: either twenty-four queries or the whole
       * mall map threaded through every listing page and every rail, for a
       * panel almost nobody opens. One href costs nothing and lands on the
       * surface built for it. The product PAGE — one card, one shop, one floor
       * — gets the real sheet.
       *
       * `z-20` and a sibling of the stretched link, not a child: the card's
       * `::after` covers the whole tile at z-10, so anything meant to be
       * clickable inside it has to sit above that, and an anchor nested in an
       * anchor is invalid HTML the parser silently unpicks.
       */}
      <span className="text-2xs relative z-20 truncate text-neutral-500">
        {shopFloor === undefined || shopFloor === null ? (
          shopName
        ) : (
          <>
            {shopName}
            <span aria-hidden> · </span>
            <Link
              href={`/floors?floor=${shopFloor}`}
              className="hover:text-primary underline decoration-dotted underline-offset-2 transition-colors duration-150"
            >
              {common('floorName', { floor: shopFloor })}
            </Link>
          </>
        )}
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
