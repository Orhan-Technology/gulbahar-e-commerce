'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number;
  /** Currency renders through formatCurrency; count through formatNumber. */
  format?: 'currency' | 'count';
  /** Signed fraction, e.g. 0.12 for +12%. */
  delta?: number | null;
  icon?: React.ReactNode;
  className?: string;
}

const COUNT_UP_MS = 280;

/**
 * Dashboard stat with a count-up on first mount (PRD §6.1, §10.6).
 *
 * The animation is capped well under the 300ms motion budget and is skipped
 * entirely under prefers-reduced-motion, which also means the final value is
 * present immediately for anyone who never sees the animation.
 */
export function StatCard({
  label,
  value,
  format = 'count',
  delta,
  icon,
  className,
}: StatCardProps) {
  const locale = useLocale();
  const display = useCountUp(value);

  const formatted =
    format === 'currency' ? formatCurrency(display, locale) : formatNumber(display, locale);

  const hasDelta = delta !== null && delta !== undefined && delta !== 0;
  const positive = (delta ?? 0) > 0;

  return (
    <div className={cn('rounded-card border-border bg-card shadow-card border p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground text-sm">{label}</span>
        {icon && <span className="text-primary-600">{icon}</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-foreground text-2xl font-bold tabular-nums">{formatted}</span>
        {hasDelta && (
          <span
            className={cn(
              'rounded-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-semibold',
              positive ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger',
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3 rtl:-scale-x-100" aria-hidden />
            ) : (
              <ArrowDownRight className="h-3 w-3 rtl:-scale-x-100" aria-hidden />
            )}
            {formatPercent(Math.abs(delta!), locale)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Animates 0 → target once on mount.
 *
 * Under reduced motion the effect bails out without touching state and the
 * target is returned directly — no setState inside the effect, which would
 * trigger the cascading render React 19 warns about. The only setState happens
 * inside the rAF callback, after the effect has already committed.
 */
function useCountUp(target: number) {
  const prefersReduced = usePrefersReducedMotion();
  const [animated, setAnimated] = React.useState(0);

  React.useEffect(() => {
    if (prefersReduced) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      // Ease-out so the number decelerates into its final value.
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, prefersReduced]);

  return prefersReduced ? target : animated;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Reads the media query through useSyncExternalStore rather than an
 * effect-plus-setState pair. The value is therefore correct on the very first
 * client render, and the server snapshot (`false`) keeps SSR deterministic.
 */
export function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

StatCard.Skeleton = function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-card border-border bg-card shadow-card border p-4', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
    </div>
  );
};
