'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { InlineDecision } from '@/components/admin/inline-decision';
import {
  InlineNudgeShop,
  InlineReviewModeration,
} from '@/components/admin/inline-queue-actions';
import { pressable } from '@/components/motion/pressable';
import { formatNumber, formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type AdminQueueRow = {
  key: string;
  kind: 'pending_shop' | 'requested_campaign' | 'reported_review' | 'stale_order';
  /** The decision target — a shop id or a campaign id. Absent on link-only rows. */
  decisionId?: string;
  decisionKind?: 'shop' | 'campaign';
  /** Ids for the two row types that decide in place since C4. */
  reviewId?: string;
  orderId?: string;
  monogram: string;
  title: string;
  subtitle: string;
  href: string;
  at: string;
  tone: 'primary' | 'warning' | 'danger' | 'muted';
};

const TONES = {
  primary: 'bg-primary-700',
  warning: 'bg-warning',
  danger: 'bg-danger',
  muted: 'bg-neutral-400',
} as const;

/**
 * CLIENT HALF of the admin action centre.
 *
 * Same shape as the shopkeeper's queue and deliberately so — one queue idiom
 * across both panels, so a row means the same thing on either screen (PRD §10.4).
 * It owns only the optimistic state: which rows have been decided but not yet
 * committed, so a decision can be undone during its window and the row grows
 * back rather than reappearing on a refresh.
 */
export function AdminActionQueueList({
  rows,
  heading,
  emptyTitle,
  emptyBody,
  showMoreLabel,
  visibleRows,
}: {
  rows: AdminQueueRow[];
  heading: string;
  emptyTitle: string;
  emptyBody: string;
  showMoreLabel: string;
  /** Owned by the server half — a const exported from here would be a client
   *  reference by the time the server did arithmetic with it. */
  visibleRows: number;
}) {
  const locale = useLocale();
  const [resolved, setResolved] = React.useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = React.useState(false);

  const dismiss = React.useCallback((key: string) => {
    setResolved((current) => new Set(current).add(key));
  }, []);

  const restore = React.useCallback((key: string) => {
    setResolved((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);

  const remaining = rows.length - rows.filter((row) => resolved.has(row.key)).length;

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<CheckCircle2 className="h-7 w-7" />}
        title={emptyTitle}
        description={emptyBody}
      />
    );
  }

  return (
    <section className="rounded-card border-border bg-card overflow-hidden border">
      <header className="border-border flex items-center gap-2 border-b p-4">
        <h2 className="text-sm font-bold">{heading}</h2>
        <span
          className={cn(
            'rounded-pill text-2xs px-2 py-1 font-bold tabular-nums transition-colors duration-150',
            remaining > 0 ? 'bg-danger text-danger-fg' : 'bg-success-bg text-success',
          )}
        >
          {formatNumber(remaining, locale)}
        </span>
      </header>

      <ul className="divide-border divide-y">
        {(expanded ? rows : rows.slice(0, visibleRows)).map((row, index) => {
          const leaving = resolved.has(row.key);
          const decidable = row.decisionId && row.decisionKind;
          // Every row type now acts in place, so the chevron is only for rows
          // that genuinely have nowhere to act — none, today.
          const actionable = decidable || row.reviewId || row.orderId;

          return (
            <li
              key={row.key}
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
              )}
              aria-hidden={leaving}
            >
              <div className="overflow-hidden">
                <div className={cn('flex gap-3 p-4', index < 3 && 'animate-queue-in')}>
                  <span
                    className={cn('rounded-pill w-[3px] shrink-0 self-stretch', TONES[row.tone])}
                    aria-hidden
                  />

                  {/*
                    A monogram, not a logo image. Half these rows are about a
                    shop that has not been approved yet and so has no artwork
                    on the storefront; a mix of photographs and empty squares
                    reads worse than a consistent set of initials.
                  */}
                  {row.monogram && (
                    <span
                      className="rounded-control bg-primary-50 text-primary flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold"
                      aria-hidden
                    >
                      {row.monogram}
                    </span>
                  )}

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      {actionable ? (
                        <Link href={row.href} className="hover:text-primary text-sm font-semibold">
                          {row.title}
                        </Link>
                      ) : (
                        <span className="text-foreground text-sm font-semibold">{row.title}</span>
                      )}
                      <time
                        dateTime={new Date(row.at).toISOString()}
                        className="shrink-0 text-xs text-neutral-400"
                      >
                        {formatRelative(row.at, locale)}
                      </time>
                    </div>

                    {row.subtitle && (
                      <p className="text-xs leading-relaxed text-neutral-600">{row.subtitle}</p>
                    )}

                    {decidable && (
                      <InlineDecision
                        kind={row.decisionKind!}
                        id={row.decisionId!}
                        onOptimistic={() => dismiss(row.key)}
                        onRollback={() => restore(row.key)}
                      />
                    )}

                    {row.reviewId && (
                      <InlineReviewModeration
                        reviewId={row.reviewId}
                        onOptimistic={() => dismiss(row.key)}
                        onRollback={() => restore(row.key)}
                      />
                    )}

                    {/* The row stays: the order is still unanswered, and what
                        changed is that the shopkeeper has been told. */}
                    {row.orderId && <InlineNudgeShop orderId={row.orderId} />}
                  </div>

                  {/* A row with no inline decision is a link, and says so. */}
                  {!actionable && (
                    <Link
                      href={row.href}
                      className={cn(
                        pressable,
                        'text-muted-foreground hover:text-primary self-center transition-[color,scale] duration-150 ease-out',
                      )}
                      aria-label={row.title}
                    >
                      <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!expanded && rows.length > visibleRows && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            pressable,
            'border-border text-primary flex w-full items-center justify-center gap-1.5 border-t p-3 text-xs font-semibold transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-50',
          )}
        >
          {showMoreLabel}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </section>
  );
}
