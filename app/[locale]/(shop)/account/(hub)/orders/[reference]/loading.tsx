import { AccountSectionSkeleton } from '@/components/custom/page-skeleton';

/** Route-level loading state (PRD §10.5) — the hub layout stays put around it. */
export default function Loading() {
  return <AccountSectionSkeleton rows={3} />;
}
