'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Star } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatRating } from '@/lib/format';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-6 w-6',
} as const;

export interface RatingStarsProps {
  /** 0–5, fractional allowed in display mode. */
  value: number;
  size?: keyof typeof SIZES;
  /** Review count shown beside the stars. Omit to hide. */
  count?: number;
  className?: string;
}

/**
 * Display mode: fractional fill, so 4.3 shows a partially filled fourth star.
 *
 * The fill is an absolutely-positioned overlay clipped by width and anchored to
 * the inline start, so it grows right-to-left in Dari and left-to-right in
 * English without duplicating markup (PRD §10.3).
 */
export function RatingStars({ value, size = 'md', count, className }: RatingStarsProps) {
  const locale = useLocale();
  const t = useTranslations('product');
  const clamped = Math.max(0, Math.min(5, value));
  const percent = (clamped / 5) * 100;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
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
            <Star key={index} className={cn(SIZES[size], 'text-neutral-300')} />
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
              <Star key={index} className={cn(SIZES[size], 'fill-primary-600 text-primary-600')} />
            ))}
          </span>
        </span>
      </span>

      {count !== undefined && (
        <span className="text-muted-foreground text-xs">({formatNumber(count, locale)})</span>
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
                active ? 'fill-primary-600 text-primary-600' : 'text-neutral-300',
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
