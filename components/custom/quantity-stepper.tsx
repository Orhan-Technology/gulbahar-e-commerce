'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  /** Usually the product's remaining stock. */
  max?: number;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Quantity control for the cart and product page.
 *
 * Minus sits at the inline start and plus at the inline end, so in Dari the
 * decrement button is on the right — which is where a right-to-left reader
 * expects the "first" control. Nothing here is positioned physically; the flex
 * row inherits document direction (PRD §10.3).
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  size = 'md',
  className,
}: QuantityStepperProps) {
  const locale = useLocale();
  const t = useTranslations('cart');

  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const buttonSize = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <div
      className={cn(
        'rounded-control border-input bg-card inline-flex items-center border',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(buttonSize, 'rounded-s-control rounded-none')}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || atMin}
        aria-label={t('decreaseQuantity')}
      >
        <Minus />
      </Button>

      <span
        className={cn(
          'min-w-10 text-center font-semibold tabular-nums select-none',
          size === 'sm' ? 'text-sm' : 'text-base',
        )}
        aria-live="polite"
      >
        {formatNumber(value, locale)}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(buttonSize, 'rounded-e-control rounded-none')}
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        disabled={disabled || atMax}
        aria-label={t('increaseQuantity')}
      >
        <Plus />
      </Button>
    </div>
  );
}

QuantityStepper.Skeleton = function QuantityStepperSkeleton({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Skeleton
      className={cn('rounded-control', size === 'sm' ? 'h-8 w-28' : 'h-10 w-32', className)}
    />
  );
};
