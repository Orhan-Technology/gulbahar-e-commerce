import { PageSkeleton } from '@/components/custom/page-skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * The calendar is a grid of slot-days, so it gets the grid skeleton — and it is
 * reached by the month arrows, which means the previous month's grid would
 * otherwise sit there looking current while the next one loaded.
 */
export default function Loading() {
  return <PageSkeleton variant="grid" rows={3} />;
}
