import { PageSkeleton } from '@/components/custom/page-skeleton';

/**
 * Route-level loading state (PRD §10.5).
 *
 * Lives inside the `(index)` route group, not beside it. A loading.tsx applies
 * to its segment AND every segment nested under it, so at `products/` it would
 * also wrap `products/[slug]` — and a route that streams has already sent its
 * 200 by the time the page calls notFound(), which turns every unpublished or
 * missing product into a soft 404 that crawlers index as a real page. The group
 * adds no URL segment and scopes the boundary to this listing alone.
 */
export default function Loading() {
  return <PageSkeleton variant="grid" rows={8} />;
}
