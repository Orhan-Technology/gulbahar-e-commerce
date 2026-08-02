import { CheckoutItemsSkeleton } from '@/components/shop/checkout/checkout-items';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * The page awaits the cart, the site settings, the session and the saved
 * addresses before it renders anything at all, and it is reached from the one
 * button a shopper presses with intent. Showing them the cart they just left
 * for the length of four queries is the worst place on the storefront to do it.
 *
 * The basket summary reuses CheckoutItemsSkeleton — the same block the form
 * itself falls back to — so the panel does not change shape as the page settles.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:py-6" aria-busy>
      <Skeleton className="h-7 w-40" />

      <div className="mt-4 space-y-6">
        {/* Fulfilment: heading over two side-by-side choice cards. */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          <Skeleton className="h-4 w-32" />
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="rounded-control h-20 w-full" />
            ))}
          </div>
        </section>

        {/* Address block. */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="rounded-control h-16 w-full" />
          ))}
          <Skeleton className="rounded-control h-10 w-40" />
        </section>

        {/* Payment. */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          <Skeleton className="h-4 w-28" />
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="rounded-control h-16 w-full" />
            ))}
          </div>
        </section>

        <CheckoutItemsSkeleton />

        {/* Totals and the place-order button. */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
          <div className="border-border flex items-center justify-between border-t pt-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="rounded-control h-12 w-full" />
        </section>
      </div>
    </div>
  );
}
