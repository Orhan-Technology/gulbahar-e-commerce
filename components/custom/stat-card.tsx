'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number;
  /** Currency renders through formatCurrency; count through formatNumber. */
  format?: 'currency' | 'count' | 'compact' | 'percent';
  /** Signed fraction, e.g. 0.12 for +12%. */
  delta?: number | null;
  /**
   * A third line under the figure — what the number is made of ("31 orders",
   * "4 low on stock"). It is the line that turns a number into a sentence, so
   * every tile on the dashboard and revenue screens carries one.
   */
  hint?: string;
  hintTone?: keyof typeof HINT_TONES;
  /** Colour of the figure itself; the exception, not the rule. */
  tone?: keyof typeof VALUE_TONES;
  icon?: React.ReactNode;
  /**
   * `tile` is the default surface: a tinted block with no border, which is how
   * stats are drawn throughout. `card` keeps the older bordered treatment for
   * the reports screens, and `feature` is the one filled blue tile that leads
   * a stat row.
   */
  variant?: keyof typeof SURFACES;
  className?: string;
}

const SURFACES = {
  tile: 'rounded-card bg-neutral-100 p-5',
  card: 'rounded-card border-border bg-card shadow-card border p-4',
  feature: 'rounded-card bg-primary-700 text-primary-foreground p-5',
} as const;

const VALUE_TONES = {
  ink: 'text-foreground',
  primary: 'text-primary-700',
  danger: 'text-danger',
  inherit: 'text-current',
} as const;

const HINT_TONES = {
  muted: 'text-neutral-500',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  /** On the filled blue tile, where only a pale tint of the same hue reads. */
  onDark: 'text-primary-200',
} as const;

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
  hint,
  hintTone = 'muted',
  tone,
  icon,
  variant = 'tile',
  className,
}: StatCardProps) {
  const locale = useLocale();
  // A percentage is a fraction between 0 and 1, and counting up to it in
  // integer steps would render 0% for the whole animation and then snap.
  const display = useCountUp(value, format !== 'percent');

  const formatted =
    format === 'currency'
      ? formatCurrency(display, locale)
      : format === 'compact'
        ? formatCompact(display, locale)
        : format === 'percent'
          ? formatPercent(display, locale)
          : formatNumber(display, locale);

  const hasDelta = delta !== null && delta !== undefined && delta !== 0;
  const positive = (delta ?? 0) > 0;
  const feature = variant === 'feature';

  return (
    <div className={cn(SURFACES[variant], className)}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-sm', feature ? 'text-primary-300' : 'text-neutral-500')}>
          {label}
        </span>
        {icon && <span className={feature ? 'text-primary-300' : 'text-primary-600'}>{icon}</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            'font-bold tabular-nums',
            variant === 'tile' ? 'text-xl' : 'text-2xl',
            VALUE_TONES[tone ?? (feature ? 'inherit' : 'ink')],
          )}
        >
          {formatted}
        </span>
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

      {hint && (
        <p className={cn('mt-1.5 text-xs font-medium', HINT_TONES[feature ? 'onDark' : hintTone])}>
          {hint}
        </p>
      )}
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
function useCountUp(target: number, enabled = true) {
  const prefersReduced = usePrefersReducedMotion();
  const [animated, setAnimated] = React.useState(0);

  React.useEffect(() => {
    if (prefersReduced || !enabled) return;

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
  }, [target, prefersReduced, enabled]);

  return prefersReduced || !enabled ? target : animated;
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

export function StatCardSkeleton({
  variant = 'tile',
  className,
}: {
  variant?: keyof typeof SURFACES;
  className?: string;
}) {
  return (
    <div className={cn(SURFACES[variant], variant === 'feature' && 'bg-neutral-50', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and StatCard.Skeleton reads as undefined. Server code
 * must import StatCardSkeleton directly.
 */
StatCard.Skeleton = StatCardSkeleton;
