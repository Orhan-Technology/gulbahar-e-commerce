import { PageSkeleton } from '@/components/custom/page-skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * `floorOccupancy()` is awaited at the page body and is the heaviest read in
 * the console — a floor plan, a unit table and a revenue roll-up per floor.
 * `grid` rather than `list`: the plan is the part that reads first, and a
 * skeleton that does not match its layout causes exactly the shift it exists
 * to prevent.
 */
export default function Loading() {
  return <PageSkeleton variant="grid" rows={4} />;
}
