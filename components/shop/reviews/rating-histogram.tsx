import { getLocale, getTranslations } from 'next-intl/server';
import { Star } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { RatingStars } from '@/components/custom/rating-stars';
import { formatNumber, formatRating } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { reviewHref, type ReviewSort } from '@/lib/review-sort';
import { cn } from '@/lib/utils';

export type RatingHistogramProps = {
  average: number;
  total: number;
  distribution: Record<number, number>;
  productSlug: string;
  /** The star filter currently in the URL, so the row can mark itself. */
  activeStar: number | null;
  /** Carried into every bar's link — changing the filter must not reset the order. */
  sort: ReviewSort;
};

/**
 * The distribution bars, as a FILTER (Prompt: review depth).
 *
 * The bars used to be a picture. On every benchmark marketplace they are the
 * primary way into the reviews — a shopper who has decided they want the item
 * reads the one-star column first, and the bar is the only affordance on the
 * page that goes straight there. Drawing it and then not connecting it is the
 * most common form of decorative data in a product page.
 *
 * EACH BAR IS A LINK, not a client filter: the answer is a real URL, so it is
 * shareable, it server-renders, and the back button undoes it. An active row
 * links BACK to the unfiltered list, so it toggles rather than becoming a dead
 * end (the chip above the list says the same thing in words).
 *
 * A row with no reviews is NOT a link. Zero is a fact worth showing — a
 * catalogue with no one-star reviews is saying something — but a link that
 * leads to an empty list is a trap.
 *
 * Bars grow from the inline start so they fill right-to-left in Dari (PRD
 * §10.3).
 */
export async function RatingHistogram({
  average,
  total,
  distribution,
  productSlug,
  activeStar,
  sort,
}: RatingHistogramProps) {
  const locale = await getLocale();
  const t = await getTranslations('product');
  const tReviews = await getTranslations('product.reviewFilter');

  if (total === 0) {
    return (
      <div className="rounded-card border-border bg-card border p-4">
        <p className="text-muted-foreground text-sm">{t('noReviewsYet')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-card border-border bg-card grid gap-5 border p-4 sm:grid-cols-[auto_1fr] sm:gap-8">
      <div className="text-center">
        <p className="text-foreground text-3xl font-bold tabular-nums">
          {formatRating(average, locale)}
        </p>
        <RatingStars value={average} size="md" className="mt-1 justify-center" />
        <p className="text-muted-foreground mt-1 text-xs">
          {t('reviewCount', { count: formatNumber(total, locale) })}
        </p>
      </div>

      <ul className="space-y-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const value = distribution[star] ?? 0;
          const percent = total > 0 ? (value / total) * 100 : 0;
          const isActive = activeStar === star;

          const row = (
            <>
              {/* The digit and a real star SVG, not "5★": a glyph renders at
                  whatever weight the active face gives it, and the two scripts
                  gave it two different marks. */}
              <span className="text-muted-foreground flex w-8 shrink-0 items-center gap-0.5 tabular-nums">
                {formatNumber(star, locale)}
                <Star className="fill-accent-warm text-accent-warm h-3 w-3" aria-hidden />
              </span>
              <span className="rounded-pill relative h-2 flex-1 overflow-hidden bg-neutral-200">
                <span
                  // Amber, matching the stars: a blue bar under an amber star row is
                  // two colours describing one number.
                  className="bg-accent-warm rounded-pill absolute inset-y-0 start-0"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="text-muted-foreground w-8 shrink-0 text-end tabular-nums">
                {formatNumber(value, locale)}
              </span>
            </>
          );

          const shared = 'flex items-center gap-2 rounded-control px-1.5 py-1 text-xs';

          return (
            <li key={star}>
              {value === 0 ? (
                <span className={cn(shared, 'opacity-60')}>{row}</span>
              ) : (
                <Link
                  href={reviewHref(productSlug, { stars: isActive ? null : star, sort })}
                  scroll={false}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={tReviews('barLabel', {
                    star: formatNumber(star, locale),
                    count: formatNumber(value, locale),
                  })}
                  className={cn(
                    pressable,
                    shared,
                    'w-full transition-[background-color,scale] duration-150 ease-out',
                    isActive ? 'bg-primary-50 ring-primary-200 ring-1' : 'hover:bg-neutral-100',
                  )}
                >
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
