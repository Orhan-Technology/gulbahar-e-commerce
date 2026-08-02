import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * `mallMap()` is the heaviest read on the storefront — every floor, every unit
 * and the shop in it — and it is awaited with the settings before the page
 * returns. The floor tabs are links, so switching floors re-enters the route and
 * would otherwise leave the previous floor's plan on screen looking current.
 *
 * The plan itself is a fixed grid of units, so its skeleton can match exactly:
 * four rows of seven, with the entrance strip between them.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Floor tabs */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="rounded-pill h-8 w-20" />
        ))}
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 9 }, (_, index) => (
          <Skeleton key={index} className="rounded-pill h-8 w-28 shrink-0" />
        ))}
      </div>

      <div className="rounded-card border-border bg-card space-y-3 border p-4">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
          {Array.from({ length: 14 }, (_, index) => (
            <Skeleton key={index} className="rounded-card h-16 w-full" />
          ))}
        </div>

        <Skeleton className="h-6 w-full" />

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
          {Array.from({ length: 14 }, (_, index) => (
            <Skeleton key={index} className="rounded-card h-16 w-full" />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}
