import { Skeleton } from '@/components/ui/skeleton';

/**
 * The owners' report is ONE body waiting on seven queries, so it needs a
 * route-level loading state rather than an internal Suspense boundary — there
 * is nothing to stream around, and without this the browser shows the PREVIOUS
 * page until the server answers (CLAUDE.md).
 *
 * It sits at `monthly/` and NOT at `reports/`. A loading.tsx applies to its
 * segment and every segment nested under it, and the reports page already
 * streams its own sections; one placed a level up would also wrap them and
 * replace four designed skeletons with this one.
 *
 * The shape mirrors the document: a title block, five numbered sections, a
 * leaderboard. A skeleton whose proportions disagree with its content is a
 * layout shift with extra steps.
 */
export default function MonthlyReportLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6" aria-busy>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="rounded-control h-8 w-56" />
      </div>

      <section className="rounded-card border-border bg-card space-y-6 border p-6">
        <div className="border-border space-y-2 border-b pb-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-3 w-48" />
        </div>

        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, tile) => (
                <div key={tile} className="space-y-1.5">
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>
    </div>
  );
}
