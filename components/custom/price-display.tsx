import { useLocale, useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import { discountFraction, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Per-size treatment. The unit stays small and muted at every size — it is a
 * label on the number, never part of the number's weight.
 */
const SIZES = {
  sm: { current: 'text-base font-bold', unit: 'text-2xs', original: 'text-2xs' },
  md: { current: 'text-lg font-bold', unit: 'text-2xs', original: 'text-xs' },
  lg: { current: 'text-2xl font-bold', unit: 'text-xs', original: 'text-base' },
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
 * Money, formatted for the active locale (PRD §11).
 *
 * The number and its unit are SEPARATE elements — bold ink figure, then a small
 * muted «افغانی» — which is how the approved mockup renders every price. The
 * `؋` symbol from `formatCurrency` is not used here: at card density a glyph
 * that reads as part of the figure made prices harder to scan, and the mockup
 * drops it everywhere in favour of the spelled unit.
 *
 * The discounted price does NOT take the accent colour. Gold on a 14px card
 * with a gold star row beside it put two competing highlights in one block; the
 * mockup keeps the live price in ink and lets the struck original and the red
 * discount pill carry the signal instead.
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
  const common = useTranslations('common');
  const styles = SIZES[size];

  const fraction = discountFraction(price, discountPrice ?? null);
  const hasDiscount = fraction !== null;
  const current = hasDiscount ? discountPrice! : price;

  return (
    <div className={cn('flex flex-wrap items-baseline gap-1.5', className)}>
      <span className={cn(styles.current, 'text-foreground tabular-nums')}>
        {formatNumber(current, locale)}
      </span>
      <span className={cn(styles.unit, 'text-neutral-600 font-medium')}>
        {common('currencyWord')}
      </span>

      {hasDiscount && (
        <>
          <span
            className={cn(styles.original, 'text-neutral-400 tabular-nums line-through')}
            aria-label={t('originalPrice')}
          >
            {formatNumber(price, locale)}
          </span>
          {showDiscountPercent && (
            <span className="rounded-pill bg-danger-bg text-danger text-2xs px-1.5 py-0.5 font-bold">
              {t('percentOff', { percent: formatPercent(fraction, locale) })}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function PriceDisplaySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-1.5', className)}>
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and PriceDisplay.Skeleton reads as undefined. Server code
 * must import PriceDisplaySkeleton directly.
 */
PriceDisplay.Skeleton = PriceDisplaySkeleton;
