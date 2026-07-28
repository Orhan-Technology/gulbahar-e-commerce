'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Heart, ImageOff } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { PriceDisplay } from '@/components/custom/price-display';
import { RatingStars } from '@/components/custom/rating-stars';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { discountFraction, formatPercent } from '@/lib/format';
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
}

/**
 * The storefront's workhorse card (PRD §10.4).
 *
 * BORDERLESS by design, per the approved mockup: the image is a rounded 1:1
 * tile floating on the page, with the text stacked beneath it at a 12px rhythm
 * and no container, border or resting shadow. At five cards to a row a bordered
 * box drew a grid of frames that competed with the photography; the photos do
 * the separating instead.
 *
 * The image box has explicit dimensions so there is zero layout shift between
 * skeleton and content (PRD §9.3). Hover zooms the photo inside its tile — the
 * only motion on the card besides the wishlist heart's single pop (PRD §10.6).
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
}: ProductCardProps) {
  const locale = useLocale();
  const t = useTranslations('product');
  const common = useTranslations('common');

  const [saved, setSaved] = React.useState(isWishlisted);
  // Keeps the heart from popping on first paint — only on user action.
  const [popping, setPopping] = React.useState(false);

  const fraction = discountFraction(price, discountPrice ?? null);
  const outOfStock = stock !== undefined && stock <= 0;

  function toggleWishlist(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const next = !saved;
    setSaved(next);
    if (next) setPopping(true);
    onToggleWishlist?.(next);
  }

  return (
    <div className={cn('group relative flex flex-col gap-3', className)}>
      <Link href={`/products/${slug}`} className="flex flex-col gap-3">
        <div className="rounded-media relative aspect-square overflow-hidden bg-neutral-100">
          {imagePath ? (
            <Image
              src={imagePath}
              alt={title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
              priority={priority}
              className={cn(
                'object-cover transition-transform duration-300 group-hover:scale-[1.04]',
                outOfStock && 'opacity-60',
              )}
            />
          ) : (
            <div className="from-primary-50 flex h-full w-full items-center justify-center bg-linear-to-br to-neutral-100 text-neutral-400">
              <ImageOff className="h-8 w-8" aria-hidden />
            </div>
          )}

          {/* Ribbons sit at the inline start so they never collide with the heart. */}
          <div className="absolute start-2.5 top-2.5 flex flex-col items-start gap-1">
            {fraction !== null && (
              <span className="rounded-pill bg-danger text-danger-fg text-2xs px-2.5 py-1.5 font-bold">
                {t('percentOff', { percent: formatPercent(fraction, locale) })}
              </span>
            )}
            {isSponsored && <SponsoredBadge />}
          </div>

          {outOfStock && (
            <div className="absolute inset-x-0 bottom-0 bg-neutral-900/75 py-1 text-center text-xs font-medium text-neutral-50">
              {t('outOfStock')}
            </div>
          )}
        </div>

        {/*
         * Two lines reserved whether the title needs them or not, so a row of
         * cards keeps its price and shop lines aligned across differing title
         * lengths — a ragged baseline is what makes a dense grid look untidy.
         */}
        <h3 className="clamp-2 text-foreground group-hover:text-primary min-h-[2.625rem] text-base leading-normal font-normal transition-colors duration-150">
          {title}
        </h3>

        {/*
         * The rating row is ALWAYS rendered, greyed out at zero reviews rather
         * than omitted. Hiding it shortened those cards by one line, which threw
         * the price and shop lines out of alignment across a five-card row — the
         * single thing that made the grid look untidy.
         */}
        <RatingStars value={rating ?? 0} count={reviewCount} size="sm" />

        <PriceDisplay price={price} discountPrice={discountPrice} size="md" />

        <span className="text-2xs truncate text-neutral-500">
          {shopFloor === undefined || shopFloor === null
            ? shopName
            : `${shopName} · ${common('floorName', { floor: shopFloor })}`}
        </span>
      </Link>

      {!hideWishlist && (
        <button
          type="button"
          onClick={toggleWishlist}
          onAnimationEnd={() => setPopping(false)}
          aria-pressed={saved}
          aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
          className="rounded-pill bg-card shadow-card hover:bg-neutral-50 focus-visible:ring-ring absolute end-2.5 top-2.5 flex h-8 w-8 items-center justify-center transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2"
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
