'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';

import { FacetControls, type FacetOptions } from '@/components/shop/listing/facet-controls';
import { activeFilterCount, PRODUCT_SORTS } from '@/lib/listing';
import { pressable } from '@/components/motion/pressable';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { formatNumber } from '@/lib/format';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The one listing toolbar (PRD §5.1).
 *
 * Category pages, search results, offers and a shop's own catalogue all render
 * this, so the count, the sort and the filter entry point sit in the same place
 * with the same behaviour on every listing in the product. That is the whole
 * point of it existing as a component rather than as four similar rows.
 *
 * STICKY under the header. A shopper twelve rows into a grid who wants to
 * re-sort should not have to scroll back to the top to do it — and on a phone,
 * where the filter button lives here too, that scroll is most of the screen.
 *
 * The offset is `--sticky-offset` and nothing else. `top-16` was a guess at a
 * header that has not been 64px tall for a long time — it is 107px at `lg` —
 * so the bar slid 43 pixels underneath it on every scroll. Exactly the drift
 * CLAUDE.md records for the buy column, the account nav and the cart summary,
 * caught a fourth time; the property is now responsive so this one declaration
 * is right at every width.
 */
export function ListingToolbar({
  total,
  facets,
  sortKey = 'sort',
  defaultSort = 'popularity',
}: {
  /** Result count for this query — the number the sheet's button promises. */
  total: number;
  /** Omit to render a toolbar with no filter controls (the offers page). */
  facets?: FacetOptions;
  /** Some surfaces sort on their own key; search uses `sort` like the rest. */
  sortKey?: string;
  /**
   * The order the grid is in when the URL names none. Selecting it clears the
   * key rather than writing it, so a surface's own default stays a default
   * instead of becoming a filter the shopper has to undo.
   */
  defaultSort?: string;
}) {
  const t = useTranslations('listing');
  const tFilters = useTranslations('filters');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = activeFilterCount(params);
  const current = params.get(sortKey) ?? defaultSort;

  function setSort(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === defaultSort) next.delete(sortKey);
    else next.set(sortKey, value);
    next.delete('page');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="bg-background/95 sticky top-[var(--sticky-offset)] z-20 -mx-4 flex flex-wrap items-center gap-3 px-4 py-3 backdrop-blur-md sm:-mx-1 sm:px-1">
      <p className="text-muted-foreground text-sm">
        {t('resultCount', {
          // `n` pluralises, `count` renders — see lib/db/queries/dashboard.ts.
          n: total,
          count: formatNumber(total, locale),
        })}
      </p>

      <div className="ms-auto flex items-center gap-2">
        {/*
          A native select, not a styled dropdown. On a phone this opens the
          platform picker, which is faster to use one-handed than anything we
          would build, and it needs no client library to be accessible.
        */}
        <label className="sr-only" htmlFor="listing-sort">
          {t('sortLabel')}
        </label>
        <select
          id="listing-sort"
          value={current}
          onChange={(event) => setSort(event.target.value)}
          className="rounded-control border-input bg-card focus-visible:ring-ring h-9 border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {PRODUCT_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`sort.${sort}`)}
            </option>
          ))}
        </select>

        {facets && (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 lg:hidden">
                <SlidersHorizontal />
                {tFilters('title')}
                {active > 0 && (
                  <span className="rounded-pill bg-primary text-primary-foreground text-2xs flex h-5 min-w-5 items-center justify-center px-1 font-bold tabular-nums">
                    {formatNumber(active, locale)}
                  </span>
                )}
              </Button>
            </SheetTrigger>

            {/*
              A BOTTOM sheet on mobile, not a side drawer. Filtering is a
              two-handed, scroll-heavy task and the bottom of the screen is
              where the thumb already is; a side drawer also has to pick a side,
              which is a direction question this app answers per locale.
            */}
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-panel">
              <SheetHeader>
                <SheetTitle>{tFilters('title')}</SheetTitle>
              </SheetHeader>

              <div className="px-4 pb-24">
                <FacetControls {...facets} />
              </div>

              {/*
                Sticky footer stating the OUTCOME rather than an "Apply".
                Filters already applied as they were touched — the page behind
                this sheet has re-rendered — so the count is real, and the
                button's only job is to get out of the way and show it.
              */}
              <div className="border-border bg-background/95 absolute inset-x-0 bottom-0 border-t p-4 backdrop-blur-md">
                <SheetClose asChild>
                  <Button className={cn(pressable, 'w-full')}>
                    {t('showResults', {
                      n: total,
                      count: formatNumber(total, locale),
                    })}
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
