import { NextResponse, type NextRequest } from 'next/server';

import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import {
  orderTiming,
  responsiveness,
  stockReport,
  viewsWithoutSales,
} from '@/lib/db/queries/shop-reports';
import { parseConsoleRange } from '@/lib/console-range';
import { parseShopReport, EXPORTABLE } from '@/lib/shop-reports';

/**
 * CSV export of any report (Prompt C10).
 *
 * A ROUTE HANDLER, which the house rule normally forbids — and this is the case
 * it carves out for. A download needs `Content-Disposition` and a non-HTML
 * content type on the RESPONSE, and a server action returns a value to React,
 * not a response to the browser. Building the file client-side from a blob
 * would mean shipping the whole report to the client a second time and
 * re-implementing every number outside lib/format.
 *
 * SCOPED TO THE CALLER'S OWN SHOP, always, and taken from the session rather
 * than the query string. A shopId parameter here would be a report of any
 * shop's stock and conversion for anyone who could type a uuid — the whole
 * point of the permission model (PRD §3.1) leaking out through a file download.
 *
 * The BOM is not decoration: Excel on Windows reads a UTF-8 CSV as Latin-1
 * without it, and every Dari product name in the file becomes mojibake. This is
 * the single most likely way for a shopkeeper's first export to look broken.
 */

// Written as an escape, not as a literal BOM character: an invisible byte at
// the top of a source file is the kind of thing an editor or a lint --fix
// silently removes, and its absence is only noticed by whoever opens the CSV
// in Excel on Windows a month later.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const user = await currentUser();
  // A shopkeeper WITH a shop. Admin is deliberately not allowed through here —
  // this is a tenant's own trading data, and the mall reads it in aggregate on
  // its own reports (PRD §3.1).
  if (!user?.id || user.role !== 'shopkeeper' || !user.shopId) {
    return new NextResponse(null, { status: 404 });
  }

  const { report: rawReport } = await params;
  const report = parseShopReport(rawReport);
  if (!EXPORTABLE.includes(report)) return new NextResponse(null, { status: 404 });

  const range = parseConsoleRange(request.nextUrl.searchParams.get('range') ?? undefined);
  const locale = request.nextUrl.searchParams.get('locale') ?? user.locale ?? 'fa';

  /*
   * Values are written RAW — integer afghanis, whole hours, plain counts — not
   * through lib/format. A CSV is read by a spreadsheet, and Persian digits with
   * an «؋» prefix arrive as text that cannot be summed. The column HEADERS are
   * translated, because those are read by a person.
   */
  let rows: Array<Array<string | number | null>>;

  switch (report) {
    case 'views': {
      const data = await viewsWithoutSales(user.shopId, range.days, 200);
      rows = [
        ['product', 'price_afn', 'stock', 'views', 'orders', 'conversion', 'suggested_fix'],
        ...data.map((row) => [
          pickLocale(row.title, locale),
          row.price,
          row.stock,
          row.views,
          row.orders,
          row.conversion.toFixed(4),
          row.hint,
        ]),
      ];
      break;
    }

    case 'stock': {
      const data = await stockReport(user.shopId, range.days);
      rows = [
        ['product', 'stock', 'price_afn', 'units_sold_in_period', 'days_since_last_sale'],
        ...data.map((row) => [
          pickLocale(row.title, locale),
          row.stock,
          row.price,
          row.unitsSold,
          row.daysSinceLastSale,
        ]),
      ];
      break;
    }

    case 'responsiveness': {
      const data = await responsiveness(user.shopId, range.days);
      rows = [
        ['day', 'median_hours_to_accept', 'median_hours_to_ready', 'mall_median_hours_to_accept'],
        ...data.map((row) => [
          row.day,
          row.acceptHours === null ? null : row.acceptHours.toFixed(2),
          row.readyHours === null ? null : row.readyHours.toFixed(2),
          row.mallAcceptHours === null ? null : row.mallAcceptHours.toFixed(2),
        ]),
      ];
      break;
    }

    case 'timing': {
      const data = await orderTiming(user.shopId, range.days);
      rows = [
        ['weekday_sunday_0', 'hour_asia_kabul', 'orders'],
        ...data.map((row) => [row.weekday, row.hour, row.orders]),
      ];
      break;
    }

    default:
      return new NextResponse(null, { status: 404 });
  }

  const filename = `gulbahar-${report}-${range.key}.csv`;

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // A shop's own trading figures — never cached by a proxy on the way.
      'Cache-Control': 'no-store, private',
    },
  });
}
