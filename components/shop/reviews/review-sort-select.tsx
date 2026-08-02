'use client';

import { useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/lib/i18n/navigation';
import {
  DEFAULT_REVIEW_SORT,
  REVIEW_PAGE_PARAM,
  REVIEW_SORT_PARAM,
  REVIEW_SORTS,
  type ReviewSort,
} from '@/lib/review-sort';

/**
 * The order the reviews are read in (Prompt: review depth).
 *
 * A NATIVE SELECT, for the reason the listing toolbar gives: on a phone it opens
 * the platform picker, which is faster one-handed than anything we would build
 * and is accessible without a client library.
 *
 * It writes the URL rather than holding state, so the order is shareable and the
 * back button undoes it — and it preserves the star filter, because someone who
 * has narrowed to one-star reviews and then asks for the most helpful of them is
 * asking one question, not two.
 *
 * Selecting the default CLEARS the key instead of writing it, so the canonical
 * address of a product page never carries a parameter nobody chose. Changing the
 * order always returns to page one: page three of "most recent" is not page
 * three of "most helpful".
 *
 * `scroll: false` plus the `#reviews` hash keeps the reader where they are — a
 * jump to the top of a product page after re-sorting its reviews is the most
 * common way this control gets in its own way.
 */
export function ReviewSortSelect({
  current,
  /** Everything else in the URL, so re-sorting cannot drop the star filter. */
  preserved,
}: {
  current: ReviewSort;
  preserved: Record<string, string>;
}) {
  const t = useTranslations('product.reviewSort');
  const router = useRouter();
  const pathname = usePathname();

  function onChange(value: string) {
    const params = new URLSearchParams(preserved);
    if (value === DEFAULT_REVIEW_SORT) params.delete(REVIEW_SORT_PARAM);
    else params.set(REVIEW_SORT_PARAM, value);
    params.delete(REVIEW_PAGE_PARAM);

    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}#reviews`, { scroll: false });
  }

  return (
    <>
      <label className="sr-only" htmlFor="review-sort">
        {t('label')}
      </label>
      <select
        id="review-sort"
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-control border-input bg-card focus-visible:ring-ring h-9 border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        {REVIEW_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t(sort)}
          </option>
        ))}
      </select>
    </>
  );
}
