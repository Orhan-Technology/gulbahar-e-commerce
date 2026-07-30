import { AccountSectionSkeleton } from '@/components/custom/page-skeleton';

/** Route-level loading state (PRD §10.5). */
export default function Loading() {
  return <AccountSectionSkeleton rows={2} />;
}
