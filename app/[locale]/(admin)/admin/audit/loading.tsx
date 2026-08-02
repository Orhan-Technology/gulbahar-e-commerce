import { PageSkeleton } from '@/components/custom/page-skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * The whole body of /admin/audit waits on three queries at the page function,
 * so there is nothing to stream around and no internal Suspense boundary could
 * help: without this file the browser keeps showing the PREVIOUS page until the
 * server answers, which reads as a frozen console rather than a loading one.
 * A list of rows behind a row of filter chips — the page's real shape.
 */
export default function Loading() {
  return <PageSkeleton variant="list" rows={10} />;
}
