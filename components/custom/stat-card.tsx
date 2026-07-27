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
    <div className={cn('rounded-card border border-border bg-card p-4 shadow-card', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && <span className="text-primary-600">{icon}</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">{formatted}</span>
        {hasDelta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-xs font-semibold',
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
 * Animates 0 → target once on mount. Returns the target immediately when the
 * user prefers reduced motion.
 */
function useCountUp(target: number) {
  const prefersReduced = usePrefersReducedMotion();
  const [display, setDisplay] = React.useState(prefersReduced ? target : 0);

  React.useEffect(() => {
    if (prefersReduced) {
      setDisplay(target);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      // Ease-out so the number decelerates into its final value.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, prefersReduced]);

  return display;
}

export function usePrefersReducedMotion() {
  const [prefers, setPrefers] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefers(query.matches);
    const listener = (event: MediaQueryListEvent) => setPrefers(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return prefers;
}

StatCard.Skeleton = function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-card border border-border bg-card p-4 shadow-card', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
    </div>
  );
};
