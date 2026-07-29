'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { CheckCircle2, ChevronDown } from 'lucide-react';

import { ActionQueueItem } from '@/components/custom/action-queue-item';
import { EmptyState } from '@/components/custom/empty-state';
import { InlineOrderAction } from '@/components/dashboard/inline-order-action';
import { pressable } from '@/components/motion/pressable';
import { OrderRejectButton } from '@/components/dashboard/orders/order-reject-button';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type QueueRow = {
  key: string;
  kind: 'new_order' | 'to_ready' | 'needs_reply' | 'out_of_stock' | 'expiring_promotion';
  title: string;
  subtitle: string;
  href: string;
  /** ISO string — the client never formats it, only hands it to <time>. */
  at: string;
  tone: 'primary' | 'warning' | 'danger' | 'muted';
  /** Present on order rows, which carry an inline control. */
  orderId?: string;
  reference?: string;
  advanceTo?: 'accepted' | 'ready';
};

/**
 * CLIENT HALF of the action queue: the optimistic list.
 *
 * Its only job is knowing which rows have been acted on but not yet committed,
 * so a resolved row can leave immediately and come back if the shopkeeper
 * presses undo (see components/dashboard/inline-order-action.tsx for why the
 * undo window sits before the commit rather than after it).
 *
 * The exit is a GRID COLLAPSE — `grid-rows-[1fr]` to `grid-rows-[0fr]` around
 * an overflow-hidden child — rather than an animated height. Height cannot be
 * transitioned from `auto`, so the alternatives are measuring the row in JS on
 * every dismissal, or a fixed height that lies about two-line rows. The grid
 * form animates the real height, needs no measurement, and is REVERSIBLE: undo
 * simply drops the id and the row grows back, with no timer racing the DOM.
 */
export function ActionQueueList({
  rows,
  heading,
  emptyTitle,
  emptyBody,
  showMoreLabel,
  visibleRows,
}: {
  rows: QueueRow[];
  heading: string;
  emptyTitle: string;
  emptyBody: string;
  /** Pre-formatted with the hidden count — the client formats no numbers. */
  showMoreLabel: string;
  /**
   * How many rows to show before offering to expand.
   *
   * A PROP, not a constant exported from here, and that is not a style choice:
   * this module is `'use client'`, so a plain `export const` imported by the
   * server half arrives as a client reference rather than as the number. The
   * arithmetic then produced NaN and the button read "NaN more items" — the
   * same RSC-boundary failure as a static attached to a client component, with
   * no type error to warn about it. The value is owned by the server file.
   */
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

  /*
   * The empty state replaces the panel only when the queue was empty to begin
   * with. Clearing the last row optimistically keeps the panel and its heading
   * in place: swapping in a celebration illustration for something that has not
   * been committed yet — and that undo may put straight back — would be the
   * screen congratulating the shopkeeper prematurely.
   */
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
            'rounded-pill px-2 py-1 text-2xs font-bold tabular-nums transition-colors duration-150',
            remaining > 0 ? 'bg-danger text-danger-fg' : 'bg-success-bg text-success',
          )}
        >
          {formatNumber(remaining, locale)}
        </span>
      </header>

      <ul className="divide-border divide-y">
        {(expanded ? rows : rows.slice(0, visibleRows)).map((row, index) => {
          const leaving = resolved.has(row.key);
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
                <ActionQueueItem
                  title={row.title}
                  subtitle={row.subtitle}
                  timestamp={row.at}
                  href={row.href}
                  tone={row.tone}
                  actions={
                    row.orderId && row.advanceTo ? (
                      <div className="flex flex-wrap gap-2">
                        <InlineOrderAction
                          orderId={row.orderId}
                          reference={row.reference ?? ''}
                          to={row.advanceTo}
                          onOptimistic={() => dismiss(row.key)}
                          onRollback={() => restore(row.key)}
                        />
                        {/* Only a new order can still be turned away. */}
                        {row.advanceTo === 'accepted' && (
                          <OrderRejectButton orderId={row.orderId} size="sm" />
                        )}
                      </div>
                    ) : undefined
                  }
                  // Only the first few animate in; a dozen rows sliding at once
                  // is noise, not feedback.
                  isNew={index < 3}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        Expands in place rather than linking away. The hidden rows are a mix of
        reviews, stock and promotions with no single destination, and "see all"
        landing on one of the three would be a link that lies about two of them.
      */}
      {!expanded && rows.length > visibleRows && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            pressable,
            'border-border text-primary hover:bg-neutral-50 flex w-full items-center justify-center gap-1.5 border-t p-3 text-xs font-semibold transition-[background-color,scale] duration-150 ease-out',
          )}
        >
          {showMoreLabel}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </section>
  );
}
