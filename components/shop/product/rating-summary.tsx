import { getLocale, getTranslations } from 'next-intl/server';

import { Star } from 'lucide-react';

import { RatingStars } from '@/components/custom/rating-stars';
import { formatNumber, formatRating } from '@/lib/format';

export type RatingSummaryProps = {
  average: number;
  total: number;
  distribution: Record<number, number>;
};

/**
 * Average, count and 1–5 distribution bars (PRD §5.2).
 *
 * Bars grow from the inline start so they fill right-to-left in Dari — a chart
 * that grows the wrong way is one of the tells the PRD's RTL-native requirement
 * is meant to eliminate (PRD §10.3).
 */
export async function RatingSummary({ average, total, distribution }: RatingSummaryProps) {
  const locale = await getLocale();
  const t = await getTranslations('product');

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

      <ul className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const value = distribution[star] ?? 0;
          const percent = total > 0 ? (value / total) * 100 : 0;
          return (
            <li key={star} className="flex items-center gap-2 text-xs">
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
