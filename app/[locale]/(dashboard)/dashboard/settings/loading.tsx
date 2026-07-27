import { PageSkeleton } from '@/components/custom/page-skeleton';

/** Route-level loading state (PRD §10.5). */
export default function Loading() {
  return <PageSkeleton variant="form" rows={3} />;
}
