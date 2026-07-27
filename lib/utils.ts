import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Decodes a dynamic route segment.
 *
 * A `[slug]` param arrives PERCENT-ENCODED when it contains non-ASCII characters,
 * so a Dari slug reaches the page as "%D9%85%D8%AD..." and every lookup by slug
 * silently misses — the page 404s while generateMetadata, which resolves params
 * separately, still finds the row. Every route that looks a record up by slug must
 * go through this.
 *
 * Malformed input is returned unchanged rather than thrown: a bad URL should 404
 * on the lookup, not crash the route.
 */
export function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}
