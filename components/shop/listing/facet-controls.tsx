'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

import { RatingStars } from '@/components/custom/rating-stars';
import { pressable } from '@/components/motion/pressable';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { activeFilterCount, PRESERVED_KEYS, PRICE_BANDS } from '@/lib/listing';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { digitsOnly } from '@/lib/digits';
import { formatCurrency, formatNumber } from '@/lib/format';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type FacetOptions = {
  shops: Array<{ id: string; slug: string; name: LocalizedText }>;
  categories: Array<{
    slug: string;
    name: LocalizedText;
    children: Array<{ slug: string; name: LocalizedText }>;
  }>;
  /** Brands the catalogue actually holds, most-stocked first. */
  brands?: Array<{ value: string; count: number }>;
  priceMin: number;
  priceMax: number;
  /**
   * How many results each option would return, per axis, keyed by the value the
   * URL carries. Absent when the surface could not describe its own scope — see
   * filterFacets — and every count then simply does not render.
   */
  counts?: {
    categories: Record<string, number>;
    shops: Record<string, number>;
    brands: Record<string, number>;
  };
  /**
   * Hides the axis a surface is already scoped to. A shop page filtering by
   * shop, or a category page filtering by category, is a control that can only
   * take you off the page you are on.
   */
  hide?: Array<'category' | 'shop'>;
};

/** Brands beyond this fold behind "show all" — the tail is a long one. */
const BRANDS_VISIBLE = 6;

/**
 * The facet controls (PRD §5.1, Baymard-informed).
 *
 * ONE control set, rendered twice: in the desktop rail and inside the mobile
 * sheet. Not two implementations that look alike — the previous pair drifted
 * within a single release, and a filter that behaves differently depending on
 * viewport is a bug the desktop reviewer never sees.
 *
 * STATE LIVES ENTIRELY IN THE URL. A filtered view is therefore shareable,
 * survives refresh and back/forward, and can be server-rendered — which is what
 * keeps the results grid a server component with no client-side fetching.
 *
 * Changes apply IMMEDIATELY rather than on an Apply button, on mobile too. The
 * sheet's button is a dismiss that states the outcome ("Show 34 products"), and
 * the count in it is real because the page behind the sheet has already
 * re-rendered. Staging changes locally would mean either a second count
 * endpoint or a button that promises a number nobody has computed.
 */
export function FacetControls({
  shops,
  categories,
  brands = [],
  priceMin,
  priceMax,
  counts,
  hide = [],
}: FacetOptions) {
  const t = useTranslations('filters');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Local state for the price inputs so typing does not fire a navigation per
  // keystroke; committed on blur or Enter.
  const [minInput, setMinInput] = React.useState(params.get('priceMin') ?? '');
  const [maxInput, setMaxInput] = React.useState(params.get('priceMax') ?? '');
  const [allBrands, setAllBrands] = React.useState(false);

  const selectedShops = params.getAll('shop');
  const selectedBrands = params.getAll('brand');
  const selectedCategory = params.get('category') ?? '';
  const minRating = Number(params.get('minRating') ?? 0);
  const inStock = params.get('inStock') === '1';
  const onOffer = params.get('onOffer') === '1';

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

  const clearAll = React.useCallback(() => {
    const next = new URLSearchParams();
    for (const key of PRESERVED_KEYS) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const activeCount = activeFilterCount(params);
  const showCategories = !hide.includes('category') && categories.length > 0;
  const showShops = !hide.includes('shop') && shops.length > 0;

  /*
   * ABSENT FROM THE MAP MEANS ZERO, not "unknown".
   *
   * The count queries group over matching rows, so an option with no results
   * has no row at all. Reading the map directly therefore made every excluded
   * option look uncounted — the shop rail listed all ten tenants unnumbered on
   * a search that only two of them answered, which is the exact false
   * impression the counts exist to remove. `counts` being undefined is the only
   * real unknown, and that is the whole-object check.
   */
  const countOf = (axis: 'categories' | 'shops' | 'brands', key: string) =>
    counts ? (counts[axis][key] ?? 0) : undefined;

  /*
   * A ticked option NEVER disappears, however its count reads. Hiding the
   * control that produced the current result set leaves a shopper who narrowed
   * too far with no way back except the chips — and on a phone the chips are on
   * the screen behind this sheet.
   */
  const listedBrands = brands.filter(
    (brand) => selectedBrands.includes(brand.value) || (countOf('brands', brand.value) ?? 1) > 0,
  );
  const visibleBrands = allBrands ? listedBrands : listedBrands.slice(0, BRANDS_VISIBLE);
  const showBrands = visibleBrands.length > 0;

  return (
    <div className="space-y-6">
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="text-danger w-full justify-start" onClick={clearAll}>
          <X />
          {t('clearAll')}
        </Button>
      )}

      {showCategories && (
        <FacetGroup title={t('category')}>
          <ul className="space-y-1">
            {categories.map((parent) => (
              <li key={parent.slug}>
                <FacetButton
                  active={selectedCategory === parent.slug}
                  count={countOf('categories', parent.slug)}
                  locale={locale}
                  onClick={() =>
                    update((next) => {
                      if (selectedCategory === parent.slug) next.delete('category');
                      else next.set('category', parent.slug);
                    })
                  }
                >
                  {pickLocale(parent.name, locale)}
                </FacetButton>

                {parent.children.length > 0 && (
                  <ul className="border-border ms-3 border-s ps-2">
                    {parent.children.map((child) => (
                      <li key={child.slug}>
                        <FacetButton
                          small
                          active={selectedCategory === child.slug}
                          count={countOf('categories', child.slug)}
                          locale={locale}
                          onClick={() =>
                            update((next) => {
                              if (selectedCategory === child.slug) next.delete('category');
                              else next.set('category', child.slug);
                            })
                          }
                        >
                          {pickLocale(child.name, locale)}
                        </FacetButton>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </FacetGroup>
      )}

      {/*
        BRAND sits directly under category, above price. It is the axis a
        shopper reaches for second — «سامسونگ یا شیائومی» is a decision they
        arrive with, whereas a price band is one they discover — and the column
        it was missing from was the one place the buy box already advertised it.
      */}
      {showBrands && (
        <FacetGroup title={t('brand')}>
          <ul className="space-y-1.5">
            {visibleBrands.map((brand) => {
              const total = countOf('brands', brand.value);
              const empty = total === 0;
              return (
                <li key={brand.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`brand-${brand.value}`}
                    checked={selectedBrands.includes(brand.value)}
                    disabled={empty && !selectedBrands.includes(brand.value)}
                    onCheckedChange={(checked) =>
                      update((next) => {
                        const current = next.getAll('brand').filter((value) => value !== brand.value);
                        next.delete('brand');
                        for (const value of current) next.append('brand', value);
                        if (checked) next.append('brand', brand.value);
                      })
                    }
                  />
                  <Label
                    htmlFor={`brand-${brand.value}`}
                    className={cn(
                      'flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-sm font-normal',
                      empty && 'text-muted-foreground cursor-not-allowed',
                    )}
                  >
                    {/* A brand is a proper noun in both languages, so it is one
                        string in the column and reads left-to-right either way. */}
                    <span className="truncate" dir="ltr">
                      {brand.value}
                    </span>
                    <FacetCount value={total} locale={locale} />
                  </Label>
                </li>
              );
            })}
          </ul>

          {listedBrands.length > BRANDS_VISIBLE && (
            <button
              type="button"
              onClick={() => setAllBrands((open) => !open)}
              className="text-primary text-xs font-semibold hover:underline"
            >
              {allBrands
                ? t('showLess')
                : t('showAllBrands', {
                    count: formatNumber(listedBrands.length, locale),
                  })}
            </button>
          )}
        </FacetGroup>
      )}

      <FacetGroup title={t('priceRange')}>
        {/* Quick bands first: most shoppers want "cheap" or "premium", not a
            number. The inputs stay for the ones who do. */}
        <div className="flex flex-wrap gap-1.5">
          {PRICE_BANDS.map((band) => {
            const from = Math.round(priceMax * band.from);
            const to = Math.round(priceMax * band.to);
            const active = params.get('priceMin') === String(from) && params.get('priceMax') === String(to);
            return (
              <button
                key={band.key}
                type="button"
                onClick={() =>
                  update((next) => {
                    if (active) {
                      next.delete('priceMin');
                      next.delete('priceMax');
                    } else {
                      next.set('priceMin', String(from));
                      next.set('priceMax', String(to));
                    }
                    setMinInput(active ? '' : String(from));
                    setMaxInput(active ? '' : String(to));
                  })
                }
                className={cn(
                  pressable,
                  'rounded-pill border px-2.5 py-1 text-xs transition-[background-color,border-color,color,scale] duration-150 ease-out',
                  active
                    ? 'border-primary bg-primary-50 text-primary font-semibold'
                    : 'border-border hover:border-primary',
                )}
              >
                {band.from === 0
                  ? t('under', { amount: formatCurrency(to, locale) })
                  : band.to === 1
                    ? t('over', { amount: formatCurrency(from, locale) })
                    : `${formatCurrency(from, locale)} – ${formatCurrency(to, locale)}`}
              </button>
            );
          })}
        </div>

        <p className="text-muted-foreground text-xs">
          {t('priceHint', {
            min: formatCurrency(priceMin, locale),
            max: formatCurrency(priceMax, locale),
          })}
        </p>

        {/*
          `dir="ltr"` on the inputs, inside an RTL page. A price is typed
          left-to-right in both languages — the digits are, even in Persian
          script — and leaving these to inherit put the caret and the thousands
          on the wrong side of the field.
        */}
        {/*
          `digitsOnly` rather than a `\D` strip: JS `\D` is ASCII-only, so it
          DELETES «۵۰۰» keystroke by keystroke and the field stays empty for
          anyone on a Persian keyboard — which is everyone this filter is
          primarily for. The hint directly above these inputs renders its bounds
          in Persian numerals, so the control was rejecting the very script it
          had just used to describe itself.
        */}
        <div className="flex items-center gap-2" dir="ltr">
          <Input
            value={minInput}
            onChange={(event) => setMinInput(digitsOnly(event.target.value))}
            onBlur={() =>
              update((next) => (minInput ? next.set('priceMin', minInput) : next.delete('priceMin')))
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
            onChange={(event) => setMaxInput(digitsOnly(event.target.value))}
            onBlur={() =>
              update((next) => (maxInput ? next.set('priceMax', maxInput) : next.delete('priceMax')))
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
      </FacetGroup>

      <FacetGroup title={t('minRating')}>
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
                pressable,
                'rounded-control flex w-full items-center gap-2 px-2 py-1.5 transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-100',
                minRating === rating && 'bg-primary-50',
              )}
            >
              {/* No `reserveSpace`: these three rows are 4, 3 and 2, so none of
                  them can be the unrated case the prop exists for. The ProductCard
                  is the one place that needs it, because a grid has to stay aligned
                  across products that do and do not have reviews. */}
              <RatingStars value={rating} size="sm" />
              <span className="text-muted-foreground text-xs">{t('andUp')}</span>
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title={t('availability')}>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={inStock}
              onCheckedChange={(checked) =>
                update((next) => (checked ? next.set('inStock', '1') : next.delete('inStock')))
              }
            />
            <span className="text-sm">{t('inStockOnly')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={onOffer}
              onCheckedChange={(checked) =>
                update((next) => (checked ? next.set('onOffer', '1') : next.delete('onOffer')))
              }
            />
            <span className="text-sm">{t('onOfferOnly')}</span>
          </label>
        </div>
      </FacetGroup>

      {showShops && (
        <FacetGroup title={t('shop')}>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pe-1">
            {shops
              .filter(
                (shop) =>
                  selectedShops.includes(shop.slug) || (countOf('shops', shop.slug) ?? 1) > 0,
              )
              .map((shop) => {
                const total = countOf('shops', shop.slug);
                return (
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
                    <Label
                      htmlFor={`shop-${shop.slug}`}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-sm font-normal"
                    >
                      <span className="truncate">{pickLocale(shop.name, locale)}</span>
                      <FacetCount value={total} locale={locale} />
                    </Label>
                  </li>
                );
              })}
          </ul>
        </FacetGroup>
      )}
    </div>
  );
}

/** Collapsible on mobile, always open on desktop — one heading either way. */
function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The number beside an option.
 *
 * Renders NOTHING when the surface could not compute counts, rather than a
 * placeholder or a zero — an invented number on a filter is the one kind of
 * wrong that costs a shopper a click every time.
 */
function FacetCount({ value, locale }: { value: number | undefined; locale: string }) {
  if (value === undefined) return null;
  return (
    <span className="text-2xs shrink-0 text-neutral-500 tabular-nums">
      {formatNumber(value, locale)}
    </span>
  );
}

function FacetButton({
  active,
  small,
  count,
  locale,
  onClick,
  children,
}: {
  active: boolean;
  small?: boolean;
  count?: number;
  locale: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // Dimmed and inert rather than removed: a taxonomy with holes in it reads as
  // a bug, and the reader loses the map of what the mall sells.
  const empty = count === 0 && !active;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      className={cn(
        pressable,
        'rounded-control flex w-full items-center gap-1.5 px-2 text-start transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100',
        small ? 'py-1 text-xs' : 'py-1.5 text-sm',
        active && 'bg-primary-50 text-primary font-semibold',
        empty && 'text-muted-foreground cursor-not-allowed hover:bg-transparent',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <FacetCount value={count} locale={locale} />
    </button>
  );
}
