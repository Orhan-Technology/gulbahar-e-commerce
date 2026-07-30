import * as React from 'react';

import { cn } from '@/lib/utils';

export interface UnavailableCardProps {
  /** Icon for the thing that is not available — rendered at reduced opacity. */
  icon?: React.ReactNode;
  title: string;
  /** One honest sentence: what it will do, and why it is not here yet. */
  body: string;
  /** Already-translated "coming soon" pill text. */
  pillLabel: string;
  className?: string;
}

/**
 * The one recipe for a surface we cannot back (Prompt A3).
 *
 * The rule it exists to enforce: a disabled surface STATES WHAT IT WILL DO AND
 * WHY IT IS NOT AVAILABLE. It never shows placeholder data, never opens a
 * dialog, and never appears without a real product reason. Anything that fails
 * that test gets deleted rather than disabled — an inert control with no
 * explanation is worse than an absent one, because the visitor spends their
 * attention working out that nothing happened.
 *
 * Deliberately NOT a button, a link, or anything focusable: there is no
 * `tabIndex`, no `onClick`, no `cursor-pointer`, and `aria-disabled` tells a
 * screen reader the same thing the muted surface tells a sighted reader. A
 * greyed-out button still takes tab focus and still invites a click; a region
 * does neither.
 *
 * Visual separation from a live card is the whole point — dashed border, no
 * shadow, muted fill, faded icon — so a presenter never has to say "that one
 * doesn't do anything yet" out loud.
 */
export function UnavailableCard({
  icon,
  title,
  body,
  pillLabel,
  className,
}: UnavailableCardProps) {
  return (
    <section
      // `role="group"` is not decoration: a bare <section> is a `region`, and
      // `aria-disabled` is not supported there — the state would be dropped
      // silently by assistive tech and flagged by jsx-a11y.
      role="group"
      aria-disabled
      className={cn(
        'rounded-card border-border flex items-start gap-3 border border-dashed bg-neutral-50 p-4',
        className,
      )}
    >
      {icon && (
        <span
          className="rounded-control flex h-10 w-10 shrink-0 items-center justify-center bg-neutral-200/60 text-neutral-500 opacity-60"
          aria-hidden
        >
          {icon}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-600">{title}</h3>
          <span className="rounded-pill text-2xs bg-neutral-200 px-2 py-0.5 font-medium text-neutral-600">
            {pillLabel}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">{body}</p>
      </div>
    </section>
  );
}
