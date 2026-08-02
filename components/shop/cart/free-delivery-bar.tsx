import { Truck } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * How close the basket is to free delivery (PRD §8.1).
 *
 * It was a sentence — "spend 240 ؋ more and delivery is free" — which is the
 * fact but not the feeling. A bar answers "am I nearly there?" in one glance,
 * which is the question that actually changes what somebody adds to the basket,
 * and it is the same control on the cart and at checkout so the answer does not
 * appear to change between the two screens.
 *
 * PRESENTATIONAL ONLY: the message is composed by the caller, because one side
 * of this is a server component and the other is inside the checkout form. No
 * `'use client'` — it has no state and no handlers, so it renders in either.
 *
 * RTL: the fill is a block child, so it grows from the inline start in both
 * directions without a single physical property.
 */
export function FreeDeliveryBar({
  percent,
  message,
  reached,
  className,
}: {
  /** 0–100. The caller clamps; this only rounds for the aria value. */
  percent: number;
  message: React.ReactNode;
  reached: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={cn(
        'rounded-control space-y-2 border px-3 py-2.5',
        reached ? 'border-success-border bg-success-bg' : 'border-primary-200 bg-primary-50',
        className,
      )}
    >
      <p
        className={cn(
          'flex items-start gap-1.5 text-xs leading-relaxed',
          reached ? 'text-success' : 'text-primary-800',
        )}
      >
        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{message}</span>
      </p>

      {/*
        The bar is decoration for a sentence that already says the number, so it
        is hidden from assistive technology rather than announced as a second,
        less precise version of the same fact.
      */}
      <div
        className={cn(
          'rounded-pill h-1.5 w-full overflow-hidden',
          reached ? 'bg-success-border' : 'bg-primary-100',
        )}
        aria-hidden
      >
        <div
          className={cn(
            'rounded-pill h-full transition-[width] duration-300 ease-out',
            reached ? 'bg-success' : 'bg-primary-600',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
