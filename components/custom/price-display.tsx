import { useLocale, useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import { discountFraction, formatCurrency, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: { current: 'text-sm font-semibold', original: 'text-xs' },
  md: { current: 'text-base font-semibold', original: 'text-sm' },
  lg: { current: 'text-xl font-bold', original: 'text-base' },
} as const;

export interface PriceDisplayProps {
  /** Integer afghanis (CLAUDE.md). */
  price: number;
  /** Integer afghanis. Ignored when it is not actually cheaper than `price`. */
  discountPrice?: number | null;
  size?: keyof typeof SIZES;
  /** Renders the "N% off" pill next to the price. */
  showDiscountPercent?: boolean;
  className?: string;
}

/**
 * Money, formatted for the active locale (PRD §11). Dari renders Persian digits,
 * `٬` separators and a `؋` prefix; English renders "AFN 1,250".
 *
 * When discounted, the original is struck through and the live price takes the
 * accent colour — the one place gold appears at body-text size.
 */
export function PriceDisplay({
  price,
  discountPrice,
  size = 'md',
  showDiscountPercent = false,
  className,
}: PriceDisplayProps) {
  const locale = useLocale();
  const t = useTranslations('product');
  const styles = SIZES[size];

  const fraction = discountFraction(price, discountPrice ?? null);
  const hasDiscount = fraction !== null;
  const current = hasDiscount ? discountPrice! : price;

  return (
    <div className={cn('flex flex-wrap items-baseline gap-2', className)}>
      <span className={cn(styles.current, hasDiscount ? 'text-accent-700' : 'text-foreground')}>
        {formatCurrency(current, locale)}
      </span>

      {hasDiscount && (
        <>
          <span
            className={cn(styles.original, 'text-muted-foreground line-through')}
            aria-label={t('originalPrice')}
          >
            {formatCurrency(price, locale)}
          </span>
          {showDiscountPercent && (
            <span className="rounded-pill bg-danger-bg text-danger px-1.5 py-0.5 text-xs font-semibold">
              {t('percentOff', { percent: formatPercent(fraction, locale) })}
            </span>
          )}
        </>
      )}
    </div>
  );
}

PriceDisplay.Skeleton = function PriceDisplaySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-4 w-14" />
    </div>
  );
};
