import * as React from 'react';
import { useLocale } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Urgency is carried by a rail down the inline-start edge rather than by a
 * tinted icon tile: four rows of coloured tiles read as decoration, whereas a
 * 3px rail is a severity scale you can scan in one pass.
 */
const TONES = {
  primary: 'bg-primary-700',
  warning: 'bg-warning',
  danger: 'bg-danger',
  success: 'bg-success',
  muted: 'bg-neutral-400',
} as const;

export interface ActionQueueItemProps {
  title: string;
  subtitle?: string;
  /** ISO string or Date. Rendered as a localized relative time. */
  timestamp?: string | Date;
  /** Deep link to the exact screen and item (PRD §6.1). */
  href: string;
  tone?: keyof typeof TONES;
  /**
   * Controls that resolve the item without leaving the dashboard — accept an
   * order, mark it ready. Their presence turns the row from a link into a
   * container: a button inside an anchor is invalid, so the title carries the
   * link instead and the chevron is dropped.
   */
  actions?: React.ReactNode;
  /** Applies the slide-in animation for items that just arrived (PRD §10.6). */
  isNew?: boolean;
  className?: string;
}

/**
 * A single row of the shopkeeper's action queue — the dashboard centrepiece
 * (PRD §6.1). Every item deep-links to the screen where the action is taken.
 *
 * The row carries no border of its own; the queue panel draws the hairlines,
 * so a run of items reads as one list rather than a stack of cards.
 */
export function ActionQueueItem({
  title,
  subtitle,
  timestamp,
  href,
  tone = 'primary',
  actions,
  isNew = false,
  className,
}: ActionQueueItemProps) {
  const locale = useLocale();

  const time = timestamp ? (
    <time
      dateTime={new Date(timestamp).toISOString()}
      className="shrink-0 text-xs text-neutral-400"
    >
      {formatRelative(timestamp, locale)}
    </time>
  ) : null;

  const rail = (
    <span className={cn('rounded-pill w-[3px] shrink-0 self-stretch', TONES[tone])} aria-hidden />
  );

  if (actions) {
    return (
      <div className={cn('flex gap-3 p-4', isNew && 'animate-queue-in', className)}>
        {rail}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link href={href} className="hover:text-primary text-sm font-semibold">
              {title}
            </Link>
            {time}
          </div>
          {subtitle && <p className="text-xs leading-relaxed text-neutral-600">{subtitle}</p>}
          {actions}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 p-4 transition-colors duration-150 hover:bg-neutral-50',
        isNew && 'animate-queue-in',
        className,
      )}
    >
      {rail}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-foreground text-sm font-semibold">{title}</span>
          {time}
        </span>
        {subtitle && (
          <span className="mt-1 block text-xs leading-relaxed text-neutral-600">{subtitle}</span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

export function ActionQueueItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 p-4', className)}>
      <Skeleton className="rounded-pill h-10 w-[3px] shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and ActionQueueItem.Skeleton reads as undefined. Server code
 * must import ActionQueueItemSkeleton directly.
 */
ActionQueueItem.Skeleton = ActionQueueItemSkeleton;
