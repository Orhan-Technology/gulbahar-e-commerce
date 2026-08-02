'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, LayoutGrid, Package, Search, Sparkle, Store, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { TypedPlaceholder, useTypedPlaceholder } from '@/components/shop/search/typed-placeholder';
import {
  fetchSuggestions,
  fetchTrending,
  recordSearch,
  type Suggestion,
  type TrendingTerm,
} from '@/lib/actions/search';
import { useRecentSearches } from '@/components/shop/search/recent-searches';
import { useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/** Chips per page of trending. Eight fills the panel's width without wrapping past two rows. */
const TRENDING_PER_PAGE = 8;

/**
 * Header search with type-ahead suggestions (PRD §5.2).
 *
 * Debounced at 200ms and guarded against out-of-order responses: a slow request
 * for "sam" must not overwrite the results for "samsung". Keyboard navigable, and
 * Enter with nothing highlighted runs a full search rather than doing nothing.
 */
const DEBOUNCE_MS = 200;

export function HeaderSearch({
  className,
  /**
   * `pill` is the storefront header's treatment: a wide neutral capsule with a
   * gold mark and a solid green submit button, per the approved mockup. `plain`
   * is the bare bordered input, kept for narrow contexts.
   */
  variant = 'plain',
  /**
   * Prefills the field — the results page passes the term it is showing, so
   * refining a search is an edit rather than a retype.
   */
  initialQuery = '',
  autoFocus = false,
}: {
  className?: string;
  variant?: 'plain' | 'pill';
  initialQuery?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations('nav');
  const tSearch = useTranslations('search');
  const locale = useLocale();
  const router = useRouter();

  const [query, setQuery] = React.useState(initialQuery);
  const [focused, setFocused] = React.useState(false);

  /*
   * Frozen once, not rebuilt each render: the typing hook takes the array as a
   * dependency, and a fresh array literal every render would restart the
   * animation from the first character on every keystroke.
   */
  const hints = React.useMemo(
    () => [t('searchHint1'), t('searchHint2'), t('searchHint3'), t('searchHint4')],
    [t],
  );
  // Stops while the field is in use — a placeholder animating under a cursor
  // that is already typing is noise, not personality.
  const typed = useTypedPlaceholder(hints, variant === 'pill' && !focused && query.length === 0);
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(-1);

  const { terms: recent, remember, forget, clear } = useRecentSearches();
  const [trending, setTrending] = React.useState<TrendingTerm[]>([]);
  /*
   * Which slice of the trending pool is on screen. "Refresh" advances it rather
   * than re-querying: the aggregate does not change between two clicks, so a
   * refetch would redraw the identical chips and the button would look broken.
   * A larger pool is fetched once and rotated through.
   */
  const [page, setPage] = React.useState(0);

  // Monotonic id so only the newest response is applied.
  const requestId = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const term = query.trim();
    const id = ++requestId.current;

    /*
     * Both the fetch AND the clear happen inside the timer, never directly in the
     * effect body: a synchronous setState in an effect causes a cascading render,
     * which React 19 flags. Short terms resolve to an empty list here rather than
     * via an early-return setItems([]).
     */
    const timer = setTimeout(async () => {
      const results = term.length < 2 ? [] : await fetchSuggestions(term, locale);
      if (id === requestId.current) {
        setItems(results);
        setHighlighted(-1);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, locale]);

  /*
   * Trending is fetched ONCE, on first open, not on mount: most visits never
   * touch the search box, and an aggregate query on every page load to populate
   * a panel nobody opened is a query nobody asked for.
   */
  React.useEffect(() => {
    if (!open || trending.length > 0) return;
    let live = true;
    void fetchTrending(locale).then((rows) => {
      if (live) setTrending(rows);
    });
    return () => {
      live = false;
    };
  }, [open, locale, trending.length]);

  // Close when focus or a click leaves the whole control.
  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function go(suggestion: Suggestion) {
    setOpen(false);
    const href = {
      product: `/products/${suggestion.slug}`,
      shop: `/shops/${suggestion.slug}`,
      category: `/categories/${suggestion.slug}`,
    }[suggestion.kind];
    router.push(href);
  }

  function runSearch(override?: string) {
    const term = (override ?? query).trim();
    setOpen(false);
    if (term) {
      remember(term);
      // Fire and forget: the reader is already navigating, and a search must
      // never wait on its own analytics.
      void recordSearch(term, locale);
    }
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => Math.min(items.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => Math.max(-1, current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted >= 0 && items[highlighted]) go(items[highlighted]);
      else runSearch();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const typing = query.trim().length >= 2;
  const visibleTrending = React.useMemo(() => {
    if (trending.length === 0) return [];
    const start = (page * TRENDING_PER_PAGE) % trending.length;
    // Wraps, so the last page is full rather than a stub of two chips.
    return [...trending, ...trending].slice(start, start + TRENDING_PER_PAGE);
  }, [trending, page]);

  const hasDiscovery = recent.length > 0 || visibleTrending.length > 0;
  // Suggestions once there is something to suggest FROM; before that, the
  // discovery panel — which is the state the field spends most of its life in.
  const showPanel = open && (typing || hasDiscovery);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
        className={cn(
          variant === 'pill' &&
            /*
             * ONE flat surface: white, a 1px border, and focus tints that
             * border. It was a tinted capsule with a 2px ring layered on top,
             * which at rest read as a disabled field and on focus produced a
             * stacked glass edge — two rounded outlines a pixel apart. A search
             * field is the most-used control on the header; it should look like
             * somewhere to type, not like a decorated pill.
             */
            // The FOCUS INDICATOR lives on the capsule, so it follows the pill
            // rather than the rectangle of the field inside it.
            'rounded-pill border-border bg-card flex items-center gap-2 border p-1.5 ps-4 transition-[border-color,box-shadow] duration-150 hover:border-neutral-300',
            'focus-within:border-primary focus-within:ring-primary-100 focus-within:ring-2',
        )}
      >
        {variant === 'pill' ? (
          <Sparkle className="text-primary-500 pointer-events-none h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-neutral-400"
            aria-hidden
          />
        )}

        <span className={cn('relative block', variant === 'pill' && 'min-w-0 flex-1')}>
          {variant === 'pill' && query.length === 0 && (
            <TypedPlaceholder text={typed} caret={!focused} />
          )}
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            /*
             * Autofocus is off by default and opt-in per surface. The one place
             * it is asked for is /search with no query, which is a screen whose
             * entire purpose is this field — on a phone that is the difference
             * between landing on the search page and searching. Anywhere else it
             * would steal the caret from whatever the reader was doing.
             */
            autoFocus={autoFocus}
            // The pill draws its own animated placeholder above; a native one
            // would sit underneath it, showing two labels at once.
            placeholder={variant === 'pill' ? undefined : t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            aria-expanded={showPanel}
            aria-autocomplete="list"
            role="combobox"
            className={cn(
              variant === 'pill'
                ? /*
                   * The capsule owns the border, background and focus ring, so
                   * the field surrenders all three.
                   *
                   * `ring-offset-0` IS REQUIRED and `ring-0` alone is not
                   * enough: Tailwind computes the ring's spread as ring width
                   * PLUS offset width, so `ring-0` inherited alongside the base
                   * Input's `ring-offset-2` still painted a 2px ring in the ring
                   * COLOUR. Inside a pill, that drew a 12px-radius rounded
                   * rectangle whose corners were the only part not hidden by the
                   * capsule — two stray blue arcs floating beside the button.
                   * twMerge cannot catch it either: `ring-0` and `ring-offset-2`
                   * are different utility groups, so it has nothing to collapse.
                   */
                  'h-9 w-full border-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
                : 'ps-9',
            )}
          />
        </span>

        {variant === 'pill' && (
          <button
            type="submit"
            aria-label={t('searchSubmit')}
            className="rounded-pill bg-primary text-primary-foreground hover:bg-primary-600 focus-visible:ring-ring flex h-9 w-9 shrink-0 items-center justify-center transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
        )}
      </form>

      {showPanel && (
        <div
          role="listbox"
          data-search-panel={typing ? 'suggestions' : 'discovery'}
          className="rounded-card border-border bg-overlay shadow-overlay absolute inset-x-0 top-full z-50 mt-1 overflow-hidden border"
        >
          {/*
            THE PANEL BEFORE THERE IS A QUERY. Two lists doing different jobs:
            what this reader did, and what everyone did. Recent comes first —
            it is theirs and it is usually the one they wanted.
          */}
          {!typing && (
            <div className="divide-border divide-y">
              {recent.length > 0 && (
                <section className="p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold">{tSearch('recentHeading')}</h2>
                    <button
                      type="button"
                      onClick={clear}
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      {tSearch('clearRecent')}
                    </button>
                  </div>

                  <ul data-recent-searches={recent.length}>
                    {recent.map((term) => (
                      <li key={term} className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => runSearch(term)}
                          className="hover:text-primary flex min-w-0 flex-1 items-center gap-2 rounded-control px-1 py-2 text-start text-sm hover:bg-neutral-50"
                        >
                          <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
                          <span className="truncate">{term}</span>
                        </button>
                        {/*
                          Always rendered, not revealed on hover: a control that
                          only exists under a pointer does not exist on a touch
                          screen, and this panel opens there too.
                        */}
                        <button
                          type="button"
                          onClick={() => forget(term)}
                          aria-label={tSearch('removeRecent', { term })}
                          className="rounded-control shrink-0 p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {visibleTrending.length > 0 && (
                <section className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold">{tSearch('trendingHeading')}</h2>
                    {trending.length > TRENDING_PER_PAGE && (
                      <button
                        type="button"
                        onClick={() => setPage((current) => current + 1)}
                        className="text-primary text-xs font-medium hover:underline"
                      >
                        {tSearch('refreshTrending')}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2" data-trending-searches={trending.length}>
                    {visibleTrending.map((term) => (
                      <button
                        key={`${page}-${term.label}`}
                        type="button"
                        onClick={() => runSearch(term.label)}
                        className="rounded-pill border-border bg-card hover:border-primary hover:text-primary border px-3 py-1.5 text-xs font-medium transition-colors duration-150"
                      >
                        {term.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {typing && items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">{tSearch('noSuggestions')}</p>
          ) : typing ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {items.map((suggestion, index) => (
                <li key={`${suggestion.kind}-${suggestion.slug}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => go(suggestion)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-start transition-colors duration-150',
                      index === highlighted ? 'bg-neutral-100' : 'hover:bg-neutral-50',
                    )}
                  >
                    <span className="rounded-control relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-neutral-100">
                      {suggestion.imagePath ? (
                        <Image
                          src={suggestion.imagePath}
                          alt=""
                          fill
                          sizes="36px"
                          className="object-cover"
                        />
                      ) : suggestion.kind === 'shop' ? (
                        <Store className="h-4 w-4 text-neutral-400" aria-hidden />
                      ) : suggestion.kind === 'category' ? (
                        <LayoutGrid className="text-primary h-4 w-4" aria-hidden />
                      ) : (
                        <Package className="h-4 w-4 text-neutral-400" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm">
                        {suggestion.label}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {suggestion.kind === 'shop'
                          ? tSearch('shopLabel')
                          : suggestion.kind === 'category'
                            ? tSearch('categoryLabel')
                            : suggestion.sublabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Only with a query behind it — "see all results for ''" is not an offer. */}
          {typing && (
            <button
              type="button"
              onClick={() => runSearch()}
              className="border-border text-primary hover:bg-primary-50 w-full border-t px-3 py-2 text-start text-xs font-medium"
            >
              {tSearch('seeAllFor', { term: query.trim() })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
