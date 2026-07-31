import { getLocale, getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import type { ShopReportKey } from '@/lib/shop-reports';
import { cn } from '@/lib/utils';

/**
 * CSV export (Prompt C10).
 *
 * A PLAIN ANCHOR, not a button with an onClick, and not `next/link`. The
 * response is a file with a `Content-Disposition` header — the browser's own
 * download machinery handles it, which means it works with JavaScript disabled,
 * shows the browser's real download progress, and never leaves a spinner
 * spinning if the server is slow. A client component here would buy nothing and
 * cost a bundle.
 *
 * `next/link` is wrong for the same reason it is wrong on any non-page URL: it
 * would prefetch the route on hover, which for this URL means silently
 * generating the whole report every time the cursor passes over the button.
 *
 * The locale rides along so the product names in the file are in the language
 * the shopkeeper is reading, and `download` names the file even if a proxy
 * strips the header.
 */
export async function ExportButton({
  report,
  range,
}: {
  report: ShopReportKey;
  range: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopReports');

  return (
    <a
      href={`/api/reports/${report}?range=${range}&locale=${locale}`}
      download={`gulbahar-${report}-${range}.csv`}
      className={cn(
        pressable,
        'rounded-control border-border bg-card hover:border-primary hover:text-primary inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition-[color,border-color,scale] duration-150 ease-out',
      )}
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {t('exportCsv')}
    </a>
  );
}
