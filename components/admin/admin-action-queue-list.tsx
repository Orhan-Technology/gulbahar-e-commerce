'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { CheckCircle2, ChevronDown, ChevronRight, Phone, Quote } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { InlineDecision } from '@/components/admin/inline-decision';
import {
  InlineNudgeShop,
  InlineReviewModeration,
  InlineVerificationActions,
} from '@/components/admin/inline-queue-actions';
import { pressable } from '@/components/motion/pressable';
import { formatNumber, formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type AdminQueueRow = {
  key: string;
  kind:
    | 'pending_shop'
    | 'verification'
    | 'requested_campaign'
    | 'reported_review'
    | 'stale_order';
  /** The decision target — a shop id or a campaign id. Absent on link-only rows. */
  decisionId?: string;
  decisionKind?: 'shop' | 'campaign';
  /** Ids for the two row types that decide in place since C4. */
  reviewId?: string;
  orderId?: string;
  /** The human reference (GC-…), so the cancel dialog can name the order. */
  orderReference?: string;
  /** Verification rows link to the queue, where the documents are (C7). */
  verificationId?: string;
  monogram: string;
  title: string;
  subtitle: string;
  href: string;
  at: string;
  tone: 'primary' | 'warning' | 'danger' | 'muted';
  /**
   * "waiting 3 days" — finished on the server, in the stalled order's grammar.
   * See components/admin/admin-action-queue.tsx for why every row has one.
   */
  waited: string;
  waitLevel: 'fine' | 'warning' | 'danger';
  /** Short evidence facts, already formatted and localised. */
  facts?: string[];
  /** The reported review's own words, truncated by the query. */
  excerpt?: string | null;
  /** A pending shop's banner — what a shopper would land on. */
  imagePath?: string | null;
  /** Who to ring about a pending registration, and on what number. */
  contactName?: string | null;
  contactPhone?: string | null;
};

const TONES = {
  primary: 'bg-primary-700',
  warning: 'bg-warning',
  danger: 'bg-danger',
  muted: 'bg-neutral-400',
} as const;

/**
 * The wait chip's colour, on the SHARED SLA scale (lib/queue-sla.ts).
 *
 * Deliberately quiet at `fine`: three amber chips and three red ones on a
 * six-row list is a heat map; one red chip on a list of grey ones is a
 * priority.
 */
const WAIT_TONES = {
  fine: 'bg-neutral-100 text-neutral-600',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger font-semibold',
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
  emptyAction,
  visibleRows,
}: {
  rows: AdminQueueRow[];
  heading: string;
  emptyTitle: string;
  emptyBody: string;
  showMoreLabel: string;
  /**
   * The way OUT of the done state (Prompt C12).
   *
   * An empty queue that only says it is empty reads as "nothing happened here";
   * an empty queue that says «۶ تصمیم در ۲۴ ساعت گذشته» and points at the log
   * reads as "you finished". That is the difference between an inbox that
   * shrinks and a ritual that completes.
   */
  emptyAction?: { label: string; href: string };
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
        action={emptyAction}
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
          /*
            Every row type acts in place, and as of C12 that includes
            verifications — which were the last chevron-only rows on the queue.
            They still cannot be APPROVED from here (see
            InlineVerificationActions for why), but "claim it" and "open the
            documents" are real controls, and a row with real controls is not an
            odd one out.
          */
          const actionable = decidable || row.reviewId || row.orderId || row.verificationId;

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
                    THE BANNER WHEN THERE IS ONE, the monogram otherwise.
                    A monogram was the right default while these rows carried no
                    evidence at all — a mix of photographs and empty squares
                    reads worse than a consistent set of initials. Now that a
                    pending shop's card is meant to answer "what is this tenant"
                    without a click-through, the artwork the shopper would land
                    on IS the answer, and the initials remain for every row that
                    has no picture to show.
                  */}
                  {row.imagePath ? (
                    <span className="rounded-control relative h-14 w-20 shrink-0 overflow-hidden bg-neutral-100">
                      <Image
                        src={row.imagePath}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    row.monogram && (
                      <span
                        className="rounded-control bg-primary-50 text-primary flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold"
                        aria-hidden
                      >
                        {row.monogram}
                      </span>
                    )
                  )}

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {actionable ? (
                        <Link href={row.href} className="hover:text-primary text-sm font-semibold">
                          {row.title}
                        </Link>
                      ) : (
                        <span className="text-foreground text-sm font-semibold">{row.title}</span>
                      )}

                      {/*
                        HOW LONG IT HAS WAITED, on every row and on one scale.
                        The `<time>` keeps the machine-readable instant and the
                        absolute date on hover; the visible words are the thing
                        that lets the reader rank the list.
                      */}
                      <time
                        dateTime={new Date(row.at).toISOString()}
                        title={formatRelative(row.at, locale)}
                        className={cn(
                          'rounded-pill shrink-0 px-2 py-0.5 text-2xs tabular-nums',
                          WAIT_TONES[row.waitLevel],
                        )}
                        data-wait-level={row.waitLevel}
                      >
                        {row.waited}
                      </time>
                    </div>

                    {row.subtitle && (
                      <p className="text-xs leading-relaxed text-neutral-600">{row.subtitle}</p>
                    )}

                    {/*
                      THE EVIDENCE LINE. Dot-separated rather than chips: these
                      are facts about one thing, and four pills would compete
                      with the decision buttons directly underneath.
                    */}
                    {row.facts && row.facts.length > 0 && (
                      <p className="text-2xs flex flex-wrap items-center gap-x-2 gap-y-1 text-neutral-500">
                        {row.facts.map((fact, factIndex) => (
                          <React.Fragment key={fact}>
                            {factIndex > 0 && <span aria-hidden>·</span>}
                            <span>{fact}</span>
                          </React.Fragment>
                        ))}
                      </p>
                    )}

                    {/*
                      THE OWNER'S NUMBER, as a real `tel:` link and `dir="ltr"`.
                      A phone number is the one fact on an approval card that is
                      an ACTION — half of what an approver does with an unclear
                      registration is ring the applicant — and Afghan numbers
                      typed into an RTL paragraph reverse at the bidi boundary
                      unless the run is isolated.
                    */}
                    {row.contactPhone && (
                      <p className="text-2xs flex flex-wrap items-center gap-x-1.5 text-neutral-500">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden />
                        {row.contactName && <span>{row.contactName}</span>}
                        <a
                          href={`tel:${row.contactPhone.replace(/[^\d+]/g, '')}`}
                          dir="ltr"
                          className="hover:text-primary font-medium"
                        >
                          {row.contactPhone}
                        </a>
                      </p>
                    )}

                    {/*
                      THE REPORTED TEXT ITSELF. A moderation decision is about
                      the words and nothing else, and the card used to show a
                      star rating instead — which is the one fact that cannot
                      settle it. Clamped to three lines: enough to decide most
                      of them, and the queue page has the rest.
                    */}
                    {row.excerpt && (
                      <blockquote className="rounded-control border-border flex gap-1.5 border-s-2 bg-neutral-50 p-2 text-xs leading-relaxed text-neutral-700">
                        <Quote
                          className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 rtl:-scale-x-100"
                          aria-hidden
                        />
                        {/* Two lines, not three: `clamp-2` is the utility this
                            product has, and a third would push the decision
                            buttons below the fold on a six-row queue. */}
                        <span className="clamp-2">{row.excerpt}</span>
                      </blockquote>
                    )}

                    {decidable && (
                      <InlineDecision
                        kind={row.decisionKind!}
                        id={row.decisionId!}
                        onOptimistic={() => dismiss(row.key)}
                        onRollback={() => restore(row.key)}
                      />
                    )}

                    {row.verificationId && (
                      <InlineVerificationActions verificationId={row.verificationId} />
                    )}

                    {row.reviewId && (
                      <InlineReviewModeration
                        reviewId={row.reviewId}
                        onOptimistic={() => dismiss(row.key)}
                        onRollback={() => restore(row.key)}
                      />
                    )}

                    {/* A nudge leaves the row: the order is still unanswered,
                        and what changed is that the shopkeeper has been told.
                        A cancellation collapses it, because it is resolved. */}
                    {row.orderId && (
                      <InlineNudgeShop
                        orderId={row.orderId}
                        reference={row.orderReference ?? ''}
                        onCancelled={() => dismiss(row.key)}
                      />
                    )}
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
