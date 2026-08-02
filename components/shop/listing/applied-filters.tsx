'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { PRESERVED_KEYS } from '@/lib/listing';
import { formatCurrency, formatNumber } from '@/lib/format';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type FilterLabels = {
  /** slug → display name, for the two keys whose values are not self-describing. */
  categories: Record<string, string>;
  shops: Record<string, string>;
};

/**
 * Applied-filter chips, above the grid (Baymard).
 *
 * The single highest-value thing a faceted listing can show. A narrowed result
 * set with no visible reason for being narrow is how a shopper concludes the
 * catalogue is empty — on a phone the facets are behind a button, so without
 * these chips the entire filter state is invisible from the results screen.
 *
 * Every chip removes exactly its own filter, and clear-all keeps the search
 * term and the sort (see PRESERVED_KEYS): those say what you are looking at,
 * not how it is narrowed.
 */
export function AppliedFilters({ labels }: { labels: FilterLabels }) {
  const t = useTranslations('filters');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = React.useCallback(
    (next: URLSearchParams) => {
      next.delete('page');
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const chips: Array<{ id: string; label: string; remove: () => void }> = [];

  const category = params.get('category');
  if (category) {
    chips.push({
      id: `category-${category}`,
      label: labels.categories[category] ?? category,
      remove: () => {
        const next = new URLSearchParams(params.toString());
        next.delete('category');
        go(next);
      },
    });
  }

  // A brand is its own label — no lookup table, because the URL already carries
  // the display string rather than a slug.
  for (const brand of params.getAll('brand')) {
    chips.push({
      id: `brand-${brand}`,
      label: brand,
      remove: () => {
        const next = new URLSearchParams(params.toString());
        const rest = next.getAll('brand').filter((value) => value !== brand);
        next.delete('brand');
        for (const value of rest) next.append('brand', value);
        go(next);
      },
    });
  }

  for (const slug of params.getAll('shop')) {
    chips.push({
      id: `shop-${slug}`,
      label: labels.shops[slug] ?? slug,
      remove: () => {
        const next = new URLSearchParams(params.toString());
        const rest = next.getAll('shop').filter((value) => value !== slug);
        next.delete('shop');
        for (const value of rest) next.append('shop', value);
        go(next);
      },
    });
  }

  const priceMin = params.get('priceMin');
  const priceMax = params.get('priceMax');
  if (priceMin || priceMax) {
    chips.push({
      id: 'price',
      // One chip for the pair. They are a single decision, and two chips
      // reading "from 500" and "to 2,000" invite removing half a range.
      label:
        priceMin && priceMax
          ? `${formatCurrency(Number(priceMin), locale)} – ${formatCurrency(Number(priceMax), locale)}`
          : priceMin
            ? t('over', { amount: formatCurrency(Number(priceMin), locale) })
            : t('under', { amount: formatCurrency(Number(priceMax), locale) }),
      remove: () => {
        const next = new URLSearchParams(params.toString());
        next.delete('priceMin');
        next.delete('priceMax');
        go(next);
      },
    });
  }

  const minRating = params.get('minRating');
  if (minRating) {
    chips.push({
      id: 'rating',
      label: t('ratingChip', { rating: formatNumber(Number(minRating), locale) }),
      remove: () => {
        const next = new URLSearchParams(params.toString());
        next.delete('minRating');
        go(next);
      },
    });
  }

  if (params.get('inStock') === '1') {
    chips.push({
      id: 'inStock',
      label: t('inStockOnly'),
      remove: () => {
        const next = new URLSearchParams(params.toString());
        next.delete('inStock');
        go(next);
      },
    });
  }

  if (params.get('onOffer') === '1') {
    chips.push({
      id: 'onOffer',
      label: t('onOfferOnly'),
      remove: () => {
        const next = new URLSearchParams(params.toString());
        next.delete('onOffer');
        go(next);
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.id}>
          <button
            type="button"
            onClick={chip.remove}
            className={cn(
              pressable,
              'rounded-pill border-primary bg-primary-50 text-primary inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-[background-color,scale] duration-150 ease-out hover:bg-primary-100',
            )}
          >
            {chip.label}
            <X className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{t('removeFilter')}</span>
          </button>
        </li>
      ))}

      <li>
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams();
            for (const key of PRESERVED_KEYS) {
              const value = params.get(key);
              if (value) next.set(key, value);
            }
            go(next);
          }}
          className={cn(
            pressable,
            'text-danger hover:bg-danger-bg rounded-pill px-2.5 py-1.5 text-xs font-semibold transition-[background-color,scale] duration-150 ease-out',
          )}
        >
          {t('clearAll')}
        </button>
      </li>
    </ul>
  );
}
