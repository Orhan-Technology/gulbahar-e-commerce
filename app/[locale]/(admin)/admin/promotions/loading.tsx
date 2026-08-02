import { PageSkeleton } from '@/components/custom/page-skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * Five queries in one Promise.all at the page body — slots, the ledger, the
 * calendar, the shop list and up to five hundred products for the manual
 * booking dialog — with no boundary anywhere, so this was the slowest blank
 * navigation on the surface.
 */
export default function Loading() {
  return <PageSkeleton variant="list" rows={6} />;
}
