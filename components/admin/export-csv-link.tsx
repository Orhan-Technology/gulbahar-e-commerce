import { getLocale, getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';

/**
 * "Download CSV", for the three screens that produce a file (Prompt C10).
 *
 * A PLAIN `<a download>`, not a button and not the locale-aware `Link`. Two
 * reasons, both load-bearing:
 *
 *   - `/api/reports/…` lives OUTSIDE the `[locale]` segment, and the i18n
 *     `Link` would prefix it to `/fa/api/reports/…`, which matches no route.
 *   - A download is a navigation. Fetching it in a click handler and building a
 *     blob costs a client component, a second copy of the data, and a
 *     download that cannot be resumed or opened in a new tab.
 *
 * The `locale` is passed so the file's HEADERS come back in the reader's
 * language. The VALUES never are — see the route for why raw numbers matter in
 * a spreadsheet.
 */
export async function ExportCsvLink({
  report,
  params,
}: {
  report: 'platform' | 'revenue' | 'audit';
  /** Carried through so the file matches the screen: the range, the type filter. */
  params?: Record<string, string | undefined>;
}) {
  const locale = await getLocale();
  const t = await getTranslations('console.export');

  const search = new URLSearchParams({ locale });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value);
  }

  return (
    <a
      href={`/api/reports/admin/${report}?${search.toString()}`}
      download
      className="rounded-control border-border bg-card hover:border-primary inline-flex shrink-0 items-center gap-1.5 border px-3 py-2 text-xs font-medium transition-colors duration-150"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {t('csv')}
    </a>
  );
}
