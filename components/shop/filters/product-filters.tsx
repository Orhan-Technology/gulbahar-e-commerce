'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Filter, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { RatingStars } from '@/components/custom/rating-stars';
import { formatCurrency, formatNumber } from '@/lib/format';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type ProductFiltersProps = {
  shops: Array<{ id: string; slug: string; name: LocalizedText }>;
  categories: Array<{
    slug: string;
    name: LocalizedText;
    children: Array<{ slug: string; name: LocalizedText }>;
  }>;
  priceMin: number;
  priceMax: number;
  /** Locks the category control on a category page. */
  lockedCategory?: string;
};

/**
 * Product filters (PRD §5.1). State lives entirely in the URL.
 *
 * URL-driven rather than component state so a filtered view is shareable,
 * survives refresh and back/forward, and can be server-rendered — which also
 * means the results grid stays a server component with no client-side fetching.
 *
 * On mobile the same control set opens in a sheet from the inline start, so in
 * Dari it slides in from the right.
 */
export function ProductFilters(props: ProductFiltersProps) {
  const t = useTranslations('filters');

  return (
    <>
      {/* Mobile trigger */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              <Filter />
              {t('title')}
              <ActiveCount />
            </Button>
          </SheetTrigger>
          <SheetContent side="start" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t('title')}</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <FilterControls {...props} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop rail */}
      <aside className="hidden lg:block">
        <FilterControls {...props} />
      </aside>
    </>
  );
}

function ActiveCount() {
  const params = useSearchParams();
  const locale = useLocale();
  const keys = ['category', 'shop', 'priceMin', 'priceMax', 'minRating', 'inStock'];
  const count = keys.filter((key) => params.has(key)).length;
  if (count === 0) return null;
  return (
    <Badge variant="accent" className="ms-auto">
      {formatNumber(count, locale)}
    </Badge>
  );
}

function FilterControls({
  shops,
  categories,
  priceMin,
  priceMax,
  lockedCategory,
}: ProductFiltersProps) {
  const t = useTranslations('filters');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Local state for the price inputs so typing does not fire a navigation per
  // keystroke; committed on blur or Enter.
  const [minInput, setMinInput] = React.useState(params.get('priceMin') ?? '');
  const [maxInput, setMaxInput] = React.useState(params.get('priceMax') ?? '');

  const selectedShops = params.getAll('shop');
  const selectedCategory = lockedCategory ?? params.get('category') ?? '';
  const minRating = Number(params.get('minRating') ?? 0);
  const inStock = params.get('inStock') === '1';

  const update = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      // Any filter change returns to page 1; staying on page 7 of a narrower
      // result set would show an empty grid.
      next.delete('page');
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const activeCount = ['category', 'shop', 'priceMin', 'priceMax', 'minRating', 'inStock'].filter(
    (key) => params.has(key),
  ).length;

  return (
    <div className="space-y-6">
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger w-full justify-start"
          onClick={() => {
            const next = new URLSearchParams();
            const q = params.get('q');
            const sort = params.get('sort');
            if (q) next.set('q', q);
            if (sort) next.set('sort', sort);
            const query = next.toString();
            router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
          }}
        >
          <X />
          {t('clearAll')}
        </Button>
      )}

      {/* Categories */}
      {!lockedCategory && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('category')}</h3>
          <ul className="space-y-1">
            {categories.map((parent) => (
              <li key={parent.slug}>
                <button
                  type="button"
                  onClick={() =>
                    update((next) => {
                      if (selectedCategory === parent.slug) next.delete('category');
                      else next.set('category', parent.slug);
                    })
                  }
                  className={cn(
                    'rounded-control w-full px-2 py-1.5 text-start text-sm transition-colors duration-150 hover:bg-neutral-100',
                    selectedCategory === parent.slug && 'bg-primary-50 text-primary font-semibold',
                  )}
                >
                  {pickLocale(parent.name, locale)}
                </button>
                {parent.children.length > 0 && (
                  <ul className="border-border ms-3 border-s ps-2">
                    {parent.children.map((child) => (
                      <li key={child.slug}>
                        <button
                          type="button"
                          onClick={() =>
                            update((next) => {
                              if (selectedCategory === child.slug) next.delete('category');
                              else next.set('category', child.slug);
                            })
                          }
                          className={cn(
                            'rounded-control w-full px-2 py-1 text-start text-xs transition-colors duration-150 hover:bg-neutral-100',
                            selectedCategory === child.slug &&
                              'bg-primary-50 text-primary font-semibold',
                          )}
                        >
                          {pickLocale(child.name, locale)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Price range */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('priceRange')}</h3>
        <p className="text-muted-foreground text-xs">
          {t('priceHint', {
            min: formatCurrency(priceMin, locale),
            max: formatCurrency(priceMax, locale),
          })}
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={minInput}
            onChange={(event) => setMinInput(event.target.value.replace(/\D/g, ''))}
            onBlur={() =>
              update((next) =>
                minInput ? next.set('priceMin', minInput) : next.delete('priceMin'),
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            inputMode="numeric"
            placeholder={t('from')}
            aria-label={t('from')}
            className="h-9 text-sm"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            value={maxInput}
            onChange={(event) => setMaxInput(event.target.value.replace(/\D/g, ''))}
            onBlur={() =>
              update((next) =>
                maxInput ? next.set('priceMax', maxInput) : next.delete('priceMax'),
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            inputMode="numeric"
            placeholder={t('to')}
            aria-label={t('to')}
            className="h-9 text-sm"
          />
        </div>
      </section>

      {/* Rating */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('minRating')}</h3>
        <div className="space-y-1">
          {[4, 3, 2].map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() =>
                update((next) => {
                  if (minRating === rating) next.delete('minRating');
                  else next.set('minRating', String(rating));
                })
              }
              className={cn(
                'rounded-control flex w-full items-center gap-2 px-2 py-1.5 transition-colors duration-150 hover:bg-neutral-100',
                minRating === rating && 'bg-primary-50',
              )}
            >
              <RatingStars value={rating} size="sm" />
              <span className="text-muted-foreground text-xs">{t('andUp')}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Shops */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('shop')}</h3>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pe-1">
          {shops.map((shop) => (
            <li key={shop.id} className="flex items-center gap-2">
              <Checkbox
                id={`shop-${shop.slug}`}
                checked={selectedShops.includes(shop.slug)}
                onCheckedChange={(checked) =>
                  update((next) => {
                    const current = next.getAll('shop').filter((value) => value !== shop.slug);
                    next.delete('shop');
                    for (const value of current) next.append('shop', value);
                    if (checked) next.append('shop', shop.slug);
                  })
                }
              />
              <Label htmlFor={`shop-${shop.slug}`} className="cursor-pointer text-sm font-normal">
                {pickLocale(shop.name, locale)}
              </Label>
            </li>
          ))}
        </ul>
      </section>

      {/* Availability */}
      <section className="flex items-center gap-2">
        <Checkbox
          id="in-stock"
          checked={inStock}
          onCheckedChange={(checked) =>
            update((next) => (checked ? next.set('inStock', '1') : next.delete('inStock')))
          }
        />
        <Label htmlFor="in-stock" className="cursor-pointer text-sm font-normal">
          {t('inStockOnly')}
        </Label>
      </section>
    </div>
  );
}
