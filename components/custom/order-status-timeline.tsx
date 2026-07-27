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
          'rounded-card border-danger-border bg-danger-bg flex items-center gap-3 border p-3',
          className,
        )}
      >
        <span className="rounded-pill bg-danger text-danger-fg flex h-9 w-9 shrink-0 items-center justify-center">
          <X className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-danger text-sm font-semibold">{t('rejected')}</p>
          <p className="text-danger/80 text-xs">{t('rejectedHint')}</p>
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
                      'w-0.5 flex-1 transition-colors duration-300',
                      index < currentIndex ? 'bg-primary-600' : 'bg-neutral-200',
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'pt-1.5 pb-6 text-sm',
                  done ? 'text-foreground font-medium' : 'text-muted-foreground',
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
          className="bg-primary-600 absolute top-4 h-0.5 -translate-y-1/2 transition-[width] duration-300 ease-out"
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
                    done ? 'text-foreground font-medium' : 'text-muted-foreground',
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
        'rounded-pill bg-card flex h-8 w-8 shrink-0 items-center justify-center border-2 transition-colors duration-300',
        done
          ? 'border-primary-600 bg-primary-600 text-primary-foreground'
          : 'border-neutral-200 text-neutral-400',
        current && 'ring-primary-200 ring-offset-background ring-2 ring-offset-2',
      )}
      aria-current={current ? 'step' : undefined}
    >
      {children}
    </span>
  );
}

export function OrderStatusTimelineSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-start justify-between', className)}>
      {STEPS.map((step) => (
        <div key={step.status} className="flex w-16 flex-col items-center gap-1.5">
          <Skeleton className="rounded-pill h-8 w-8" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and OrderStatusTimeline.Skeleton reads as undefined. Server code
 * must import OrderStatusTimelineSkeleton directly.
 */
OrderStatusTimeline.Skeleton = OrderStatusTimelineSkeleton;
