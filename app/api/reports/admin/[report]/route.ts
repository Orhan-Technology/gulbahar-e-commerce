import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';

import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { auditExportRows } from '@/lib/db/queries/audit';
import { campaignLedger, revenueBySlot } from '@/lib/db/queries/admin-revenue';
import {
  platformSeries,
  platformStatusMix,
  topCategories,
  topShops,
} from '@/lib/db/queries/admin-reports';
import { parseConsoleRange } from '@/lib/console-range';

/**
 * CSV export of the mall's own reports (PRD §7.3, §7.4).
 *
 * A ROUTE HANDLER, which the house rule normally forbids, and for exactly the
 * reason the shopkeeper's export carves out: a download needs
 * `Content-Disposition` and a non-HTML content type on the RESPONSE, and a
 * server action returns a value to React rather than a response to the browser.
 * Building the file client-side would mean shipping every number twice and
 * re-implementing the formatting outside lib/format.
 *
 * MIRRORS app/api/reports/[report]/route.ts DELIBERATELY — same BOM, same
 * quoting, same "headers translated, values raw" rule — because two export
 * implementations is two places for a quoting bug to live. The differences are
 * only the ones scope forces:
 *
 *   - The gate is `role === 'admin'` instead of a shopkeeper with a shop.
 *   - The data is platform-wide, which is admin's legitimate scope (PRD §3.1).
 *
 * NO ID IS ACCEPTED FROM THE CLIENT, and that matters even here. Admin can
 * already read every shop, so a `shopId` parameter would not widen anything
 * today — but it would be the one place in the codebase where a download takes
 * a target from the query string, and the next handler copied from it would not
 * be admin-only. The only parameters are the report name, the console range,
 * and a locale for the headers.
 *
 * The BOM is not decoration: Excel on Windows reads a UTF-8 CSV as Latin-1
 * without it and every Dari shop name becomes mojibake.
 */

/** Written as an escape rather than a literal: an invisible byte at the top of
 *  a source file is what a lint --fix silently removes. */
const BOM = '\uFEFF';

/** RFC 4180: quote anything containing a comma, quote or newline; double the quotes. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows: Array<Array<string | number | null>>): string {
  return BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const REPORTS = ['platform', 'revenue', 'audit'] as const;
type AdminReport = (typeof REPORTS)[number];

function parseReport(value: string): AdminReport | null {
  return (REPORTS as readonly string[]).includes(value) ? (value as AdminReport) : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const user = await currentUser();
  // 404 rather than 403: an anonymous probe learns nothing about what exists.
  if (!user?.id || user.role !== 'admin') return new NextResponse(null, { status: 404 });

  const { report: rawReport } = await params;
  const report = parseReport(rawReport);
  if (!report) return new NextResponse(null, { status: 404 });

  const range = parseConsoleRange(request.nextUrl.searchParams.get('range') ?? undefined);
  const locale = request.nextUrl.searchParams.get('locale') ?? user.locale ?? 'fa';
  const t = await getTranslations({ locale: locale === 'ps' ? 'fa' : locale, namespace: 'console.export' });

  /*
   * Values are RAW — integer afghanis, ISO timestamps, plain counts — never
   * through lib/format. A CSV is read by a spreadsheet, and Persian digits with
   * a «؋» prefix arrive as text that cannot be summed. The column HEADERS are
   * translated, because those are read by a person.
   */
  let rows: Array<Array<string | number | null>>;

  switch (report) {
    case 'platform': {
      const [series, mix, shops, categories] = await Promise.all([
        platformSeries(range.days),
        platformStatusMix(range.days),
        topShops(range.days, 100),
        topCategories(range.days, 100),
      ]);

      /*
       * ONE FILE, FOUR SECTIONS, each with its own header row and a blank line
       * between. The reports screen is four panels answering four questions and
       * an admin exporting it wants the screen, not one panel of it — four
       * separate downloads would mean four clicks and four files to reconcile
       * by hand. A `section` column instead would repeat six blank cells on
       * every row of the daily series.
       */
      rows = [
        [t('sectionDaily')],
        ['day', 'gmv_afn', 'orders'],
        ...series.map((row) => [row.day, row.revenue, row.orderCount]),
        [],
        [t('sectionStatusMix')],
        ['status', 'orders'],
        ...mix.map((row) => [row.status, row.total]),
        [],
        [t('sectionShops')],
        ['shop', 'revenue_afn', 'orders'],
        ...shops.map((row) => [pickLocale(row.name, locale), row.revenue, row.orderCount]),
        [],
        [t('sectionCategories')],
        ['category', 'revenue_afn', 'units'],
        ...categories.map((row) => [pickLocale(row.name, locale), row.revenue, row.units]),
      ];
      break;
    }

    case 'revenue': {
      const [ledger, slots] = await Promise.all([campaignLedger(), revenueBySlot()]);

      rows = [
        [t('sectionLedger')],
        [
          'shop',
          'slot',
          'product',
          'status',
          'starts_at',
          'ends_at',
          'weeks',
          'price_paid_afn',
          'impressions',
          'clicks',
        ],
        ...ledger.map((row) => [
          pickLocale(row.shopName, locale),
          pickLocale(row.slotName, locale),
          row.productTitle ? pickLocale(row.productTitle, locale) : '',
          row.status,
          row.startsAt.toISOString(),
          row.endsAt.toISOString(),
          row.weeks,
          row.pricePaid,
          row.impressions,
          row.clicks,
        ]),
        [],
        [t('sectionInventory')],
        ['slot', 'capacity', 'occupied', 'price_per_week_afn', 'month_revenue_afn'],
        ...slots.map((row) => [
          pickLocale(row.name, locale),
          row.capacity,
          row.occupied,
          row.pricePerWeek,
          row.monthRevenue,
        ]),
      ];
      break;
    }

    case 'audit': {
      // The type filter is carried across from the screen so the file matches
      // what the admin was looking at. It narrows the export; it cannot widen it.
      const type = request.nextUrl.searchParams.get('type') ?? undefined;
      const entries = await auditExportRows(type);

      rows = [
        ['created_at', 'actor', 'action', 'target_type', 'target_label', 'reason', 'detail'],
        ...entries.map((entry) => [
          entry.createdAt.toISOString(),
          entry.actorName,
          entry.action,
          entry.targetType,
          entry.targetLabel ?? '',
          entry.reason ?? '',
          // Flattened rather than JSON: a spreadsheet cell full of braces is
          // not something anyone reads, and the keys are already short.
          entry.detail
            ? Object.entries(entry.detail)
                .map(([key, value]) => `${key}=${value ?? ''}`)
                .join('; ')
            : '',
        ]),
      ];
      break;
    }

    default:
      return new NextResponse(null, { status: 404 });
  }

  const filename = `gulbahar-admin-${report}-${range.key}.csv`;

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Platform-wide trading figures — never cached by a proxy on the way.
      'Cache-Control': 'no-store, private',
    },
  });
}
