import { ProductListingSkeleton } from '@/components/shop/listing/product-listing';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * The facets and the category tree are awaited above the return, so submitting a
 * query left the PREVIOUS results on screen — the one page where a stale screen
 * is actively misleading, because the shopper cannot tell whether their new term
 * returned these rows or the old one did.
 *
 * The field and the tab strip are drawn as skeletons rather than left out: they
 * are the top of the page and the results are measured from underneath them.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:py-6" aria-busy>
      <Skeleton className="h-7 w-64" />

      <Skeleton className="rounded-pill h-11 w-full max-w-3xl" />

      <div className="border-border flex gap-2 border-b pb-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden space-y-6 lg:block">
          {Array.from({ length: 4 }, (_, group) => (
            <div key={group} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              {Array.from({ length: 5 }, (_, row) => (
                <Skeleton key={row} className="h-3 w-full" />
              ))}
            </div>
          ))}
        </aside>

        <div className="min-w-0">
          <ProductListingSkeleton />
        </div>
      </div>
    </div>
  );
}
