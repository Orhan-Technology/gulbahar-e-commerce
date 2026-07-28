'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Package, Search, Sparkle, Store } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { fetchSuggestions, type Suggestion } from '@/lib/actions/search';
import { useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

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
}: {
  className?: string;
  variant?: 'plain' | 'pill';
}) {
  const t = useTranslations('nav');
  const tSearch = useTranslations('search');
  const locale = useLocale();
  const router = useRouter();

  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(-1);

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
    router.push(
      suggestion.kind === 'product' ? `/products/${suggestion.slug}` : `/shops/${suggestion.slug}`,
    );
  }

  function runSearch() {
    const term = query.trim();
    setOpen(false);
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

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
        className={cn(
          variant === 'pill' &&
            'rounded-pill focus-within:ring-primary-200 flex items-center gap-2 bg-neutral-100 p-1.5 ps-4 transition-shadow duration-150 focus-within:ring-2',
        )}
      >
        {variant === 'pill' ? (
          <Sparkle className="text-accent pointer-events-none h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-neutral-400"
            aria-hidden
          />
        )}

        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          aria-expanded={showPanel}
          aria-autocomplete="list"
          role="combobox"
          className={cn(
            variant === 'pill'
              ? // The capsule owns the border, background and focus ring, so the
                // field itself has to surrender all three or they double up.
                'h-9 border-none bg-transparent px-0 shadow-none focus-visible:ring-0'
              : 'ps-9',
          )}
        />

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
          className="rounded-card border-border bg-overlay shadow-overlay absolute inset-x-0 top-full z-50 mt-1 overflow-hidden border"
        >
          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">{tSearch('noSuggestions')}</p>
          ) : (
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
                      ) : (
                        <Package className="h-4 w-4 text-neutral-400" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm">
                        {suggestion.label}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {suggestion.kind === 'shop' ? tSearch('shopLabel') : suggestion.sublabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={runSearch}
            className="border-border text-primary hover:bg-primary-50 w-full border-t px-3 py-2 text-start text-xs font-medium"
          >
            {tSearch('seeAllFor', { term: query.trim() })}
          </button>
        </div>
      )}
    </div>
  );
}
