import * as React from 'react';
import { useLocale } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

const TONES = {
  primary: 'bg-primary-50 text-primary-700',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger',
  success: 'bg-success-bg text-success',
} as const;

export interface ActionQueueItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** ISO string or Date. Rendered as a localized relative time. */
  timestamp?: string | Date;
  /** Deep link to the exact screen and item (PRD §6.1). */
  href: string;
  tone?: keyof typeof TONES;
  /** Applies the slide-in animation for items that just arrived (PRD §10.6). */
  isNew?: boolean;
  className?: string;
}

/**
 * A single row of the shopkeeper's action queue — the dashboard centrepiece
 * (PRD §6.1). Every item deep-links to the screen where the action is taken.
 *
 * The chevron mirrors in RTL, and new arrivals slide in via the `queue-in`
 * keyframe rather than an ad-hoc transition.
 */
export function ActionQueueItem({
  icon,
  title,
  subtitle,
  timestamp,
  href,
  tone = 'primary',
  isNew = false,
  className,
}: ActionQueueItemProps) {
  const locale = useLocale();

  return (
    <Link
      href={href}
      className={cn(
        'rounded-card border-border bg-card shadow-card flex items-center gap-3 border p-3 transition-colors duration-150 hover:bg-neutral-50',
        isNew && 'animate-queue-in',
        className,
      )}
    >
      <span
        className={cn(
          'rounded-control flex h-10 w-10 shrink-0 items-center justify-center',
          TONES[tone],
        )}
        aria-hidden
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-sm font-semibold">{title}</span>
        {subtitle && (
          <span className="text-muted-foreground block truncate text-xs">{subtitle}</span>
        )}
      </span>

      {timestamp && (
        <time
          dateTime={new Date(timestamp).toISOString()}
          className="text-muted-foreground shrink-0 text-xs"
        >
          {formatRelative(timestamp, locale)}
        </time>
      )}

      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

ActionQueueItem.Skeleton = function ActionQueueItemSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-card border-border bg-card shadow-card flex items-center gap-3 border p-3',
        className,
      )}
    >
      <Skeleton className="rounded-control h-10 w-10 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-3 w-12" />
    </div>
  );
};
