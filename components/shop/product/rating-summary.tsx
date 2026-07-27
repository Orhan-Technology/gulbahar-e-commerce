import { getLocale, getTranslations } from 'next-intl/server';

import { RatingStars } from '@/components/custom/rating-stars';
import { formatNumber } from '@/lib/format';

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
          {formatNumber(Number(average.toFixed(1)), locale)}
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
              <span className="text-muted-foreground w-8 shrink-0 tabular-nums">
                {formatNumber(star, locale)}★
              </span>
              <span className="rounded-pill relative h-2 flex-1 overflow-hidden bg-neutral-200">
                <span
                  className="rounded-pill bg-accent-500 absolute inset-y-0 start-0"
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
