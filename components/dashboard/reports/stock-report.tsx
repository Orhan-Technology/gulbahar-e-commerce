import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { ImageOff, PackageCheck } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { StockEditor } from '@/components/dashboard/products/stock-editor';
import { pickLocale } from '@/lib/db/localized';
import { stockReport, type ReportPeriod } from '@/lib/db/queries/shop-reports';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Low and out of stock (Prompt C10).
 *
 * FIXABLE FROM THE REPORT. The stock number is the same inline editor the
 * product table uses (components/dashboard/products/stock-editor.tsx) — a
 * report that can only tell you about a problem makes you navigate away to
 * solve it, and the shopkeeper loses the list they were working through.
 *
 * "DAYS SINCE IT WENT OUT" IS NOT A COLUMN HERE, and the omission is
 * deliberate. Nothing in this schema records the moment stock reached zero:
 * there is no stock event log, and `updated_at` moves for any edit at all. The
 * column shows DAYS SINCE THE LAST SALE instead and is labelled as that.
 * Deriving the stock-out date from the last sale would be right often enough to
 * be trusted and wrong exactly when a shopkeeper is arguing with a customer.
 *
 * UNITS SOLD IN THE PERIOD sits beside the stock level because they are one
 * decision: three left on something that sold sixty is an emergency, and three
 * left on something that sold one is a shelf.
 */
export async function StockReport({
  shopId,
  period,
}: {
  shopId: string;
  period: ReportPeriod;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopReports.stock');
  const rows = await stockReport(shopId, period);

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<PackageCheck className="h-7 w-7" aria-hidden />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  return (
    <>
      {/*
        CARDS ON A PHONE, TABLE FROM `md` — the same argument as the views
        report. Four columns at 390px pushed «آخرین فروش» off the end, and the
        column that survived the squeeze was the one a shopkeeper needs least.
        The card leads with the stock number BECAUSE IT IS THE EDITABLE ONE:
        restocking is the whole point of the screen, and on a phone it should be
        a thumb-sized target, not a 7px-tall inline control in a scrolled cell.
      */}
      <ul className="space-y-3 md:hidden" data-report-cards>
        {rows.map((row) => (
          <li
            key={row.id}
            data-report-row
            data-stock-state={row.stock === 0 ? 'out' : 'low'}
            className={cn(
              'rounded-card border-border bg-card space-y-3 border p-3',
              row.stock === 0 && 'border-danger/30 bg-danger-bg/30',
            )}
          >
            <Link
              href={`/dashboard/products/${row.id}`}
              className="hover:text-primary flex items-start gap-3"
            >
              <span className="rounded-control relative h-12 w-12 shrink-0 overflow-hidden bg-neutral-100">
                {row.imagePath ? (
                  <Image src={row.imagePath} alt="" fill sizes="48px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-neutral-400">
                    <ImageOff className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                {/* User-generated: sets its own base direction. */}
                <span className="clamp-2 block text-sm font-medium" dir="auto">
                  {pickLocale(row.title, locale)}
                </span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {formatCurrency(row.price, locale)}
                </span>
              </span>
              {row.stock === 0 && (
                <span className="rounded-pill bg-danger-bg text-danger text-2xs shrink-0 px-2 py-0.5 font-semibold">
                  {t('outOfStock')}
                </span>
              )}
            </Link>

            <div className="rounded-control flex items-center justify-between gap-2 bg-neutral-50 px-3 py-2">
              <span className="text-xs text-neutral-500">{t('stock')}</span>
              <StockEditor productId={row.id} stock={row.stock} />
            </div>

            <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-neutral-500">{t('unitsSold')}</dt>
                <dd className="font-semibold tabular-nums">
                  {formatNumber(row.unitsSold, locale)}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-neutral-500">{t('lastSale')}</dt>
                <dd className="tabular-nums">
                  {row.daysSinceLastSale === null
                    ? t('neverSold')
                    : t('daysAgo', {
                        n: row.daysSinceLastSale,
                        days: formatNumber(row.daysSinceLastSale, locale),
                      })}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div
        className="rounded-card border-border bg-card hidden overflow-hidden border md:block"
        data-report-table
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-border bg-neutral-50 border-b text-neutral-600">
              <tr>
                <th className="px-4 py-2.5 text-start text-xs font-semibold">{t('product')}</th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold">{t('stock')}</th>
                <th className="px-3 py-2.5 text-end text-xs font-semibold">{t('unitsSold')}</th>
                <th className="px-4 py-2.5 text-end text-xs font-semibold">{t('lastSale')}</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-report-row
                  data-stock-state={row.stock === 0 ? 'out' : 'low'}
                  className={cn(row.stock === 0 && 'bg-danger-bg/40')}
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/products/${row.id}`}
                      className="hover:text-primary flex items-center gap-2.5"
                    >
                      <span className="rounded-control relative h-9 w-9 shrink-0 overflow-hidden bg-neutral-100">
                        {row.imagePath ? (
                          <Image
                            src={row.imagePath}
                            alt=""
                            fill
                            sizes="36px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-neutral-400">
                            <ImageOff className="h-4 w-4" aria-hidden />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="clamp-1 font-medium" dir="auto">
                          {pickLocale(row.title, locale)}
                        </span>
                        <span className="text-muted-foreground block text-xs tabular-nums">
                          {formatCurrency(row.price, locale)}
                        </span>
                      </span>
                    </Link>
                  </td>

                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      {row.stock === 0 && (
                        <span className="rounded-pill bg-danger-bg text-danger px-2 py-0.5 text-2xs font-semibold">
                          {t('outOfStock')}
                        </span>
                      )}
                      <StockEditor productId={row.id} stock={row.stock} />
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-end font-semibold tabular-nums">
                    {formatNumber(row.unitsSold, locale)}
                  </td>

                  <td className="text-muted-foreground px-4 py-2.5 text-end text-xs tabular-nums">
                    {row.daysSinceLastSale === null
                      ? t('neverSold')
                      : t('daysAgo', {
                          n: row.daysSinceLastSale,
                          days: formatNumber(row.daysSinceLastSale, locale),
                        })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
