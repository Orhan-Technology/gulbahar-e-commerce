import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * `getCart()` and `siteSettings()` are awaited at the page body before anything
 * renders, so there is nothing to stream around — without this file the browser
 * keeps showing the page the shopper came FROM while their basket loads, which
 * on the one screen they navigated to on purpose reads as a dead tap.
 *
 * Two shop groups of two lines each: the shape of a Gulbahar basket, which
 * routinely spans tenants. The summary keeps the same sticky offset as the real
 * aside so the column does not jump when the totals arrive.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6" aria-busy>
      <Skeleton className="h-7 w-56" />

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {Array.from({ length: 2 }, (_, group) => (
            <section
              key={group}
              className="rounded-card border-border bg-card overflow-hidden border"
            >
              <header className="border-border flex items-center gap-2 border-b bg-neutral-50 px-4 py-2.5">
                <Skeleton className="rounded-media h-4 w-4 shrink-0" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="ms-auto h-3 w-24" />
              </header>

              <ul className="divide-border divide-y">
                {Array.from({ length: 2 }, (_, line) => (
                  <li key={line} className="flex gap-3 p-4">
                    <Skeleton className="rounded-control h-20 w-20 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="rounded-control h-9 w-32" />
                    </div>
                    <Skeleton className="h-4 w-20 shrink-0" />
                  </li>
                ))}
              </ul>

              <footer className="border-border space-y-2 border-t px-4 py-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </footer>
            </section>
          ))}
        </div>

        <aside className="lg:sticky lg:top-[var(--sticky-offset)] lg:self-start">
          <div className="rounded-card border-border bg-card shadow-card space-y-3 border p-4">
            <Skeleton className="h-5 w-32" />

            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, row) => (
                <div key={row} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
              <div className="border-border flex items-center justify-between border-t pt-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
            </div>

            <Skeleton className="h-3 w-40" />
            <Skeleton className="rounded-pill h-2 w-full" />
            <Skeleton className="rounded-control h-12 w-full" />
            <Skeleton className="rounded-control h-10 w-full" />
          </div>
        </aside>
      </div>
    </div>
  );
}
