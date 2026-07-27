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
}

/**
 * The storefront's workhorse card (PRD §10.4).
 *
 * Image is a fixed 1:1 box with explicit dimensions so there is zero layout
 * shift between skeleton and content (PRD §9.3). Hover lifts the card from
 * card to overlay elevation over 150ms — the only motion on the card besides
 * the wishlist heart's single pop (PRD §10.6).
 */
export function ProductCard({
  slug,
  title,
  shopName,
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
}: ProductCardProps) {
  const locale = useLocale();
  const t = useTranslations('product');

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
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow duration-fast hover:shadow-overlay',
        className,
      )}
    >
      <Link href={`/products/${slug}`} className="flex flex-1 flex-col">
        <div className="relative aspect-square overflow-hidden bg-neutral-100">
          {imagePath ? (
            <Image
              src={imagePath}
              alt={title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
              priority={priority}
              className={cn(
                'object-cover transition-transform duration-slow group-hover:scale-[1.03]',
                outOfStock && 'opacity-60',
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-neutral-100 text-neutral-400">
              <ImageOff className="h-8 w-8" aria-hidden />
            </div>
          )}

          {/* Ribbons sit at the inline start so they never collide with the heart. */}
          <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
            {isSponsored && <SponsoredBadge />}
            {fraction !== null && (
              <span className="rounded-pill bg-danger px-2 py-0.5 text-xs font-bold text-danger-fg shadow-card">
                {t('percentOff', { percent: formatPercent(fraction, locale) })}
              </span>
            )}
          </div>

          {outOfStock && (
            <div className="absolute inset-x-0 bottom-0 bg-neutral-900/75 py-1 text-center text-xs font-medium text-neutral-50">
              {t('outOfStock')}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <h3 className="clamp-2 text-sm font-medium leading-snug text-foreground">{title}</h3>
          <p className="truncate text-xs text-muted-foreground">{shopName}</p>

          {rating !== undefined && rating > 0 && (
            <RatingStars value={rating} count={reviewCount} size="sm" />
          )}

          <div className="mt-auto pt-1">
            <PriceDisplay price={price} discountPrice={discountPrice} size="md" />
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={toggleWishlist}
        onAnimationEnd={() => setPopping(false)}
        aria-pressed={saved}
        aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
        className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-pill bg-card/90 shadow-card backdrop-blur transition-colors duration-fast hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Heart
          className={cn(
            'h-4 w-4 transition-colors duration-fast',
            saved ? 'fill-danger text-danger' : 'text-neutral-500',
            popping && 'animate-heart-pop',
          )}
        />
      </button>
    </div>
  );
}

ProductCard.Skeleton = function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card',
        className,
      )}
    >
      {/* Matches the 1:1 image box exactly, so nothing shifts on swap. */}
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  );
};
