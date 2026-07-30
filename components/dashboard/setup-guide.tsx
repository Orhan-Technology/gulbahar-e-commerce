import { getLocale, getTranslations } from 'next-intl/server';
import { Check, ChevronRight, CircleDashed, Clock } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { shopSetupSteps } from '@/lib/db/queries/shop-setup';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The shop setup guide (Prompt C5).
 *
 * A newly approved shop lands on a dashboard of zeros — no sales, no orders, no
 * reviews — with nothing to say what to do about it. This is the answer, and it
 * sits ABOVE the queue until it is finished, because for a new tenant it IS the
 * queue.
 *
 * Every step is checked against real data rather than a stored flag (see
 * lib/db/queries/shop-setup.ts), so the guide is always true and deleting a
 * logo un-ticks its row.
 *
 * THE PENDING VARIANT is the one worth having. A shop awaiting mall approval
 * cannot sell anything yet, and the honest thing to do with that wait is fill
 * it: the card leads with what the wait means and then hands over the same
 * checklist, so a tenant arrives at approval with a finished shop rather than
 * an empty one. It is also the strongest beat in the demo — a shop guided from
 * nothing to live in two minutes.
 *
 * It disappears on its own when every step is done. There is no dismiss button
 * while steps remain: the card is the work, and hiding work is what the
 * dashboard is meant to prevent.
 */
export async function SetupGuide({ shopId }: { shopId: string }) {
  const locale = await getLocale();
  const t = await getTranslations('dashboard.setup');
  const { steps, completed, total, pending } = await shopSetupSteps(shopId);

  if (completed === total) return null;

  return (
    <section
      className={cn(
        'rounded-card border p-4',
        pending ? 'border-warning-border bg-warning-bg' : 'border-primary-200 bg-primary-50',
      )}
      aria-labelledby="setup-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="setup-heading"
            className={cn(
              'flex items-center gap-2 text-sm font-bold',
              pending ? 'text-warning-fg' : 'text-primary-800',
            )}
          >
            {pending ? (
              <Clock className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CircleDashed className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {pending ? t('pendingHeading') : t('heading')}
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-neutral-700">
            {pending ? t('pendingBody') : t('body')}
          </p>
        </div>

        <p className="text-xs font-semibold text-neutral-700 tabular-nums">
          {t('progress', {
            done: formatNumber(completed, locale),
            total: formatNumber(total, locale),
          })}
        </p>
      </div>

      {/* A bar, not a ring: the question is "how much is left", which a length
          answers at a glance and a circle makes you estimate. */}
      <div
        className="rounded-pill mt-3 h-1.5 w-full overflow-hidden bg-neutral-200"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={t('heading')}
      >
        <div
          className={cn('h-full transition-[width] duration-300 ease-out', pending ? 'bg-warning' : 'bg-primary')}
          style={{ width: formatPercentWidth(completed / total) }}
        />
      </div>

      <ul className="mt-3 space-y-1">
        {steps.map((step) => (
          <li key={step.key}>
            {step.done ? (
              /* Completed rows COLLAPSE to a line rather than disappearing:
                 seeing what is already done is what makes the remaining list
                 feel finite. */
              <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-500">
                <span className="rounded-pill bg-success text-primary-foreground flex h-4 w-4 shrink-0 items-center justify-center">
                  <Check className="h-2.5 w-2.5" aria-hidden />
                </span>
                <span className="line-through">{t(`steps.${step.key}` as never)}</span>
              </p>
            ) : (
              <Link
                href={step.href}
                className="rounded-control bg-card hover:shadow-card flex items-center gap-2 px-2 py-2 text-xs font-medium transition-shadow duration-150"
              >
                <span className="border-border flex h-4 w-4 shrink-0 rounded-full border-2" aria-hidden />
                <span className="min-w-0 flex-1">{t(`steps.${step.key}` as never)}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400 rtl:rotate-180" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The bar's width as a percentage string.
 *
 * `formatPercent` is for READING — it yields "٪۴۳" with Persian digits, which
 * is not a CSS length. This is the same number in the one form a style
 * attribute accepts.
 */
function formatPercentWidth(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function SetupGuideSkeleton() {
  return (
    <div className="rounded-card border-border space-y-3 border p-4" aria-busy>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-1.5 w-full" />
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-7 w-full" />
      ))}
    </div>
  );
}
