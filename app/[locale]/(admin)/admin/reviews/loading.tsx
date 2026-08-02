import { PageSkeleton } from '@/components/custom/page-skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * The counts and the queue are both awaited at the page body, so navigating to
 * moderation showed the previous screen until the server answered. Cards behind
 * status chips, which is what the moderation queue is.
 */
export default function Loading() {
  return <PageSkeleton variant="list" rows={6} />;
}
