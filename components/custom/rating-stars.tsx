'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Star } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatRating } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Three sizes, and only three: 14px on cards and rails, 16px in listings and
 * shop headers, 20px on the product page and the review composer.
 */
const SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;

export interface RatingStarsProps {
  /** 0–5, fractional allowed in display mode. */
  value: number;
  size?: keyof typeof SIZES;
  /** Review count shown beside the stars. Omit to hide. */
  count?: number;
  /**
   * Renders an empty row instead of nothing when there are no reviews.
   *
   * Off by default, because "(۰)" beside five grey stars is worse than
   * silence — it reports an absence as if it were a score. The one place it
   * is wanted is a card GRID, where a missing row shortens that card by a
   * line and throws the price and shop lines out of alignment across a row.
   */
  reserveSpace?: boolean;
  /**
   * Minimum reviews before a score is drawn at all (lib/ratings).
   *
   * Defaults to 1 — one review is enough to show *this* review's own stars,
   * which is what the review list and the composer do. Cards pass the shared
   * evidence threshold instead, because an average of one is not an average.
   */
  minCount?: number;
  className?: string;
}

/**
 * Display mode: fractional fill, so 4.3 shows a partially filled fourth star.
 *
 * The fill is an absolutely-positioned overlay clipped by width and anchored to
 * the inline start, so it grows right-to-left in Dari and left-to-right in
 * English without duplicating markup (PRD §10.3).
 *
 * THE EMPTY TRACK IS AN AMBER OUTLINE, the filled part a solid amber fill.
 *
 * This reverses C1, which made the empty track a solid grey silhouette, and the
 * distinction between the two is the whole point — so read this before changing
 * it back either way. What C1 removed was a GREY wireframe: at 14px, solid
 * amber stars beside thin neutral outlines read as damage, because the empty
 * ones looked like a different component that had failed to load. What is here
 * now is the same hue throughout — an unfilled star is visibly the same star,
 * just not earned — which is the treatment the client asked for and the one
 * most catalogues use.
 *
 * The clip-by-width overlay is unchanged and still does the fractional fill, so
 * a 4.3 shows four solid stars and a fifth filled 30% of the way across its
 * outline.
 */
export function RatingStars({
  value,
  size = 'md',
  count,
  reserveSpace = false,
  minCount = 1,
  className,
}: RatingStarsProps) {
  const locale = useLocale();
  const t = useTranslations('product');
  const clamped = Math.max(0, Math.min(5, value));
  const percent = (clamped / 5) * 100;

  /*
   * NOTHING WITHOUT ENOUGH EVIDENCE. An unrated product is not a bad product,
   * and a row of empty stars followed by "(0)" says it is — it is the single
   * most common way a young catalogue talks itself down. Above a caller's
   * `minCount` the same applies to a score drawn from one or two opinions.
   */
  const unrated = count !== undefined ? count < minCount : clamped === 0;
  if (unrated && !reserveSpace) return null;
  if (unrated) return <span className={cn('inline-flex h-5 items-center', className)} aria-hidden />;

  return (
    /* `reserveSpace` fixes the row's HEIGHT as well as its presence: a rated
       card and an unrated one sit side by side in the same grid row, and a
       score that is a pixel taller than the blank it replaces knocks the price
       lines out of line across the whole row. */
    <span className={cn('inline-flex items-center gap-1.5', reserveSpace && 'h-5', className)}>
      <span
        className="relative inline-flex"
        role="img"
        aria-label={t('ratingOutOfFive', {
          rating: formatRating(clamped, locale),
        })}
      >
        {/* Empty track */}
        <span className="inline-flex" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <Star
              key={index}
              className={cn(SIZES[size], 'fill-none stroke-accent-warm')}
              strokeWidth={1.5}
            />
          ))}
        </span>

        {/* Filled overlay, clipped to the rating and anchored at the inline start */}
        <span
          className="absolute inset-y-0 start-0 overflow-hidden"
          style={{ width: `${percent}%` }}
          aria-hidden
        >
          <span className="inline-flex">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={cn(SIZES[size], 'fill-accent-warm stroke-accent-warm')}
                strokeWidth={1.5}
              />
            ))}
          </span>
        </span>
      </span>

      {count !== undefined && count > 0 && (
        <span className="text-muted-foreground text-xs">{formatNumber(count, locale)}</span>
      )}
    </span>
  );
}

export interface RatingStarsInputProps {
  value: number;
  onChange: (value: number) => void;
  size?: keyof typeof SIZES;
  className?: string;
  name?: string;
}

/**
 * Input mode: whole stars only, keyboard accessible via a radio group. Arrow
 * keys move naturally because the radios follow document order, which the
 * browser already maps to the visual direction.
 */
export function RatingStarsInput({
  value,
  onChange,
  size = 'lg',
  className,
  name = 'rating',
}: RatingStarsInputProps) {
  const t = useTranslations('product');
  const [hovered, setHovered] = React.useState<number | null>(null);
  const shown = hovered ?? value;

  return (
    <div
      role="radiogroup"
      aria-label={t('yourRating')}
      className={cn('inline-flex items-center gap-1', className)}
      onMouseLeave={() => setHovered(null)}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const star = index + 1;
        const active = star <= shown;
        return (
          <label key={star} className="cursor-pointer p-0.5" onMouseEnter={() => setHovered(star)}>
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <Star
              className={cn(
                SIZES[size],
                'transition-colors duration-150',
                // Same two states as the display row, so the composer and the
                // rating it produces look like the same thing.
                active ? 'fill-accent-warm stroke-accent-warm' : 'fill-none stroke-accent-warm',
              )}
            />
            <span className="sr-only">{t('starsCount', { count: star })}</span>
          </label>
        );
      })}
    </div>
  );
}

export function RatingStarsSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-4 w-24', className)} />;
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and RatingStars.Skeleton reads as undefined. Server code
 * must import RatingStarsSkeleton directly.
 */
RatingStars.Skeleton = RatingStarsSkeleton;
