import { AccountSectionSkeleton } from '@/components/custom/page-skeleton';

/** Route-level loading state (PRD §10.5) — the hub's own header is a card. */
export default function Loading() {
  return <AccountSectionSkeleton header="card" rows={5} />;
}
