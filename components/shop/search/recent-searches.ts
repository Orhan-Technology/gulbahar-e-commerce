'use client';

import * as React from 'react';

import { MAX_SEARCH_TERM, normalizeSearchTerm } from '@/lib/search-terms';

/**
 * The reader's own recent searches, in their browser.
 *
 * NOT ON THE SERVER, and that is the whole design. A per-account search history
 * is a record of what somebody was curious about — a far more sensitive object
 * than the anonymous counts `search_queries` keeps — and it would also be
 * useless to the majority of visitors here, who are not signed in. localStorage
 * gives it to everyone, keeps it on the device, and makes "Clear" mean the
 * thing it says rather than a request to a server that may or may not honour it.
 *
 * READ THROUGH `useSyncExternalStore`, not through an effect. localStorage is
 * an external store, which is exactly what this hook is for, and it settles
 * three problems at once that the obvious `useState` + `useEffect` version
 * does not:
 *
 *   - Hydration. The server snapshot is an empty list and the client snapshot
 *     is the real one, and React is told about the difference instead of
 *     tearing over it.
 *   - The React 19 lint rule. Reading a store in an effect means a synchronous
 *     `setState` in the effect body, which is a cascading render (CLAUDE.md).
 *   - Two boxes, one list. The header renders a search field twice — the pill
 *     and the compact one — and both subscribe to the same storage, so clearing
 *     history in one updates the other. A second tab does too, for free.
 *
 * CAPPED at six. A dropdown that opens over the page has to stay shorter than
 * the thing it covers, and nobody scrolls their own history looking for a word
 * they can simply retype.
 */

const KEY = 'gulbahar:recent-searches';
const LIMIT = 6;
/** Same-tab writes: `storage` only fires in OTHER tabs. */
const CHANGED = 'gulbahar:recent-searches-changed';

/** A stable identity, so an empty list never looks like a new value to React. */
const EMPTY: string[] = [];

/*
 * `getSnapshot` must return the SAME reference until the data really changes,
 * or React re-renders forever. Parsing on every call would return a fresh array
 * each time, so the raw string is cached and only re-parsed when it differs.
 */
let cachedRaw: string | null = null;
let cachedList: string[] = EMPTY;

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const list = parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.slice(0, MAX_SEARCH_TERM))
      .slice(0, LIMIT);
    return list.length > 0 ? list : EMPTY;
  } catch {
    // A hand-edited or half-written value is not worth a crash on every focus.
    return EMPTY;
  }
}

function getSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parse(raw);
  }
  return cachedList;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function write(terms: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(terms.slice(0, LIMIT)));
  } catch {
    // Private mode, or a full quota. Losing history is not worth an error.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useRecentSearches() {
  const terms = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const remember = React.useCallback((term: string) => {
    const clean = term.trim().slice(0, MAX_SEARCH_TERM);
    if (clean.length < 2) return;

    // Deduped on the SAME normalisation the server groups trends by, so a
    // stray double space never shows the reader their own search twice.
    const key = normalizeSearchTerm(clean);
    const current = getSnapshot();
    write([clean, ...current.filter((entry) => normalizeSearchTerm(entry) !== key)]);
  }, []);

  const forget = React.useCallback((term: string) => {
    write(getSnapshot().filter((entry) => entry !== term));
  }, []);

  const clear = React.useCallback(() => write([]), []);

  return { terms, remember, forget, clear };
}
