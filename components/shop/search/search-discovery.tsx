'use client';

import { useTranslations } from 'next-intl';
import { Clock, TrendingUp, X } from 'lucide-react';

import { useRecentSearches } from '@/components/shop/search/recent-searches';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Recent and trending searches, ON the empty search page (PRD §5.2).
 *
 * THE SCREEN WHOSE SUBJECT IS THE QUERY HAD NO WAY TO START ONE. Both lists
 * already existed — they are what the header field drops down when it is
 * focused — but that panel closes the moment the reader taps anywhere, and on a
 * phone the tab bar's magnifier lands here rather than in the header. So the
 * one place someone arrives with nothing typed was also the one place the two
 * strongest starting points were hidden behind a focus state.
 *
 * REAL LINKS, not buttons that call router.push: a trending term is a place, it
 * should open in a new tab if somebody asks it to, and the list works before
 * hydration. Recent terms are links too; only the × that forgets one is a
 * button, because forgetting is not navigation.
 *
 * Renders NOTHING until it has something to show — the recent list is read from
 * localStorage through useSyncExternalStore, so its server snapshot is empty and
 * a first-time visitor with no trends behind them sees the page they always saw
 * rather than two empty headings.
 */
export function SearchDiscovery({
  trending,
}: {
  /** Read on the server; the browser has no business querying an aggregate. */
  trending: string[];
}) {
  const t = useTranslations('search');
  const { terms: recent, forget, clear } = useRecentSearches();

  if (recent.length === 0 && trending.length === 0) return null;

  const chip =
    'rounded-pill border-border bg-card hover:border-primary hover:text-primary inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-colors duration-150';

  return (
    <div className="space-y-6">
      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-bold">{t('recentHeading')}</h2>
            <button
              type="button"
              onClick={clear}
              className="text-primary rounded-control text-xs font-semibold hover:underline"
            >
              {t('clearRecent')}
            </button>
          </div>

          <ul className="flex flex-wrap gap-2" data-recent-searches={recent.length}>
            {recent.map((term) => (
              <li key={term} className="flex items-center">
                <Link
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className={cn(chip, 'pe-2')}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
                  {/* A search term is the reader's own text — Latin, Dari or
                      both — so it is isolated from the row around it. */}
                  <bdi className="max-w-40 truncate">{term}</bdi>
                </Link>
                <button
                  type="button"
                  onClick={() => forget(term)}
                  aria-label={t('removeRecent', { term })}
                  className="rounded-control -ms-7 shrink-0 p-1.5 text-neutral-400 hover:text-neutral-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">{t('trendingHeading')}</h2>
          <ul className="flex flex-wrap gap-2" data-trending-searches={trending.length}>
            {trending.map((term) => (
              <li key={term}>
                <Link href={`/search?q=${encodeURIComponent(term)}`} className={chip}>
                  <TrendingUp className="text-primary h-3.5 w-3.5 shrink-0" aria-hidden />
                  <bdi className="max-w-48 truncate">{term}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
