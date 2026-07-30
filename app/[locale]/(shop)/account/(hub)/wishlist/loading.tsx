import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * A grid, not the section skeleton: the wishlist is product cards four across
 * from `lg`, and a stack of full-width blocks would shift the whole column the
 * moment the real content arrived.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="rounded-card h-64 w-full" />
        ))}
      </div>
    </div>
  );
}
