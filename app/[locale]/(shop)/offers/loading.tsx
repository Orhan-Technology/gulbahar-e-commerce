import { OfferShowcaseSkeleton } from '@/components/shop/home/offer-showcase';
import { ProductListingSkeleton } from '@/components/shop/listing/product-listing';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * Same blocking shape as /products — the discount-scoped facets and the category
 * tree are awaited before the return — with the showcase band on top, which is
 * the tallest thing on the page and so the one most worth reserving space for.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 sm:py-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <OfferShowcaseSkeleton />

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
