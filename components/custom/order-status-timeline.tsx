import { useTranslations } from 'next-intl';
import { Check, PackageCheck, ShoppingBag, ThumbsUp, X } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Matches the order status enum in CLAUDE.md and PRD §13.2. */
export type OrderStatus = 'placed' | 'accepted' | 'ready' | 'fulfilled' | 'rejected';

/** The happy path. `rejected` is terminal and rendered separately. */
const STEPS = [
  { status: 'placed', Icon: ShoppingBag },
  { status: 'accepted', Icon: ThumbsUp },
  { status: 'ready', Icon: PackageCheck },
  { status: 'fulfilled', Icon: Check },
] as const;

export interface OrderStatusTimelineProps {
  status: OrderStatus;
  className?: string;
  /** Vertical layout for narrow order-detail panels. */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Order progression stepper (PRD §5.4, §10.4).
 *
 * RTL correctness: the connector between steps is a flex row, so it already
 * flows right-to-left in Dari. The fill grows from the inline start via
 * `start-0` rather than `left-0`, so progress advances in reading order in both
 * languages (PRD §10.3). The width transition animates when the status changes,
 * which is what the customer sees on the tracking screen (PRD §10.6).
 *
 * `rejected` short-circuits to a single terminal danger state — it is not a
 * step on the happy path, and showing it as one would imply the order might
 * still advance.
 */
export function OrderStatusTimeline({
  status,
  className,
  orientation = 'horizontal',
}: OrderStatusTimelineProps) {
  const t = useTranslations('order.status');

  if (status === 'rejected') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-card border border-danger-border bg-danger-bg p-3',
          className,
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-danger text-danger-fg">
          <X className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-danger">{t('rejected')}</p>
          <p className="text-xs text-danger/80">{t('rejectedHint')}</p>
        </div>
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((step) => step.status === status);
  // Fraction of the connector that should read as complete.
  const progress = currentIndex <= 0 ? 0 : (currentIndex / (STEPS.length - 1)) * 100;

  if (orientation === 'vertical') {
    return (
      <ol className={cn('space-y-0', className)}>
        {STEPS.map(({ status: stepStatus, Icon }, index) => {
          const done = index <= currentIndex;
          const isLast = index === STEPS.length - 1;
          return (
            <li key={stepStatus} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepDot done={done} current={index === currentIndex}>
                  <Icon className="h-4 w-4" aria-hidden />
                </StepDot>
                {!isLast && (
                  <span
                    className={cn(
                      'w-0.5 flex-1 transition-colors duration-slow',
                      index < currentIndex ? 'bg-primary-600' : 'bg-neutral-200',
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'pb-6 pt-1.5 text-sm',
                  done ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(stepStatus)}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        {/* Connector track, inset by half a dot so it meets the dot centres */}
        <div className="absolute inset-x-5 top-4 h-0.5 -translate-y-1/2 bg-neutral-200" />
        <div
          className="absolute top-4 h-0.5 -translate-y-1/2 bg-primary-600 transition-[width] duration-slow ease-out"
          style={{
            insetInlineStart: '1.25rem',
            width: `calc((100% - 2.5rem) * ${progress / 100})`,
          }}
        />

        <ol className="relative flex items-start justify-between">
          {STEPS.map(({ status: stepStatus, Icon }, index) => {
            const done = index <= currentIndex;
            return (
              <li key={stepStatus} className="flex w-16 flex-col items-center gap-1.5 text-center">
                <StepDot done={done} current={index === currentIndex}>
                  <Icon className="h-4 w-4" aria-hidden />
                </StepDot>
                <span
                  className={cn(
                    'text-xs leading-tight',
                    done ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(stepStatus)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function StepDot({
  done,
  current,
  children,
}: {
  done: boolean;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border-2 bg-card transition-colors duration-slow',
        done
          ? 'border-primary-600 bg-primary-600 text-primary-foreground'
          : 'border-neutral-200 text-neutral-400',
        current && 'ring-2 ring-primary-200 ring-offset-2 ring-offset-background',
      )}
      aria-current={current ? 'step' : undefined}
    >
      {children}
    </span>
  );
}

OrderStatusTimeline.Skeleton = function OrderStatusTimelineSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between', className)}>
      {STEPS.map((step) => (
        <div key={step.status} className="flex w-16 flex-col items-center gap-1.5">
          <Skeleton className="h-8 w-8 rounded-pill" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
};
