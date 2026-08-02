import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * The history and the per-category counts are awaited together at the page body
 * with no boundary anywhere below them. The filter chips are links, so every
 * category tap re-enters the route — the exact motion this file exists to keep
 * from freezing.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6" aria-busy>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="rounded-control h-9 w-32" />
      </header>

      <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-1 sm:mx-0 sm:px-0">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="rounded-pill h-8 w-24 shrink-0" />
        ))}
      </div>

      <ul className="space-y-2">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="rounded-card border-border bg-card flex gap-3 border p-4">
            <Skeleton className="rounded-control h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
