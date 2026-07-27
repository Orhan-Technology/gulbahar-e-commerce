import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeletons (PRD §10.5: "skeleton screens matching final
 * layout — never spinners on content, never a blank flash").
 *
 * These back the `loading.tsx` boundaries. A page whose whole body depends on one
 * awaited query has nothing to stream, so without a boundary the browser shows the
 * PREVIOUS page until the server responds — which on a detail-page navigation reads
 * as a frozen interface rather than a loading one.
 *
 * Four variants because there are four page shapes in this app, and a skeleton that
 * does not match the layout it replaces causes exactly the shift it exists to
 * prevent. Deliberately not a spinner and deliberately not one generic block.
 */
export function PageSkeleton({
  variant,
  rows = 5,
}: {
  variant: 'detail' | 'list' | 'form' | 'grid';
  /** How many repeated items to draw, tuned per route to match its usual length. */
  rows?: number;
}) {
  if (variant === 'detail') {
    return (
      <div className="space-y-4 p-4 sm:p-6" aria-busy>
        <Skeleton className="h-3 w-40" />
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="rounded-control h-9 w-28" />
        </div>
        <Skeleton className="rounded-card h-20 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="rounded-card h-56 w-full lg:col-span-2" />
          <Skeleton className="rounded-card h-56 w-full" />
        </div>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className="space-y-5 p-4 sm:p-6" aria-busy>
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="rounded-card border-border space-y-3 border p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div className="space-y-4 p-4 sm:p-6" aria-busy>
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: rows * 2 }, (_, index) => (
            <Skeleton key={index} className="rounded-card h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6" aria-busy>
      <Skeleton className="h-5 w-40" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="rounded-pill h-7 w-20" />
        ))}
      </div>
      <ul className="space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="rounded-card border-border flex gap-3 border p-3">
            <Skeleton className="rounded-control h-14 w-14 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
