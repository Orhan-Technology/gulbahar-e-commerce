'use client';

import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { formatNumber } from '@/lib/format';
import { usePathname } from '@/lib/i18n/navigation';

/**
 * Listing pagination. Builds hrefs rather than pushing programmatically, so pages
 * are real links — crawlable, middle-clickable, and usable without JS.
 *
 * A window of pages around the current one keeps the control from growing
 * unbounded on a large catalogue.
 */
export function PaginationBar({ page, pageCount }: { page: number; pageCount: number }) {
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();

  if (pageCount <= 1) return null;

  const hrefFor = (target: number) => {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(pageCount, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <Pagination className="pt-2">
      <PaginationContent>
        {page > 1 && (
          <PaginationItem>
            <PaginationPrevious href={hrefFor(page - 1)} />
          </PaginationItem>
        )}

        {pages.map((target) => (
          <PaginationItem key={target}>
            <PaginationLink href={hrefFor(target)} isActive={target === page}>
              {formatNumber(target, locale)}
            </PaginationLink>
          </PaginationItem>
        ))}

        {page < pageCount && (
          <PaginationItem>
            <PaginationNext href={hrefFor(page + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
