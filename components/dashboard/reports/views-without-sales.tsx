import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Eye, ImageOff, Lightbulb, Pencil } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { pickLocale } from '@/lib/db/localized';
import { viewsWithoutSales, type ReportPeriod } from '@/lib/db/queries/shop-reports';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Products people look at and do not buy (Prompt C10).
 *
 * THE SINGLE MOST ACTIONABLE REPORT a shopkeeper can have, because the hard
 * part already happened: someone found the product and opened it. Everything
 * between that and a sale — the photograph, the price, whether the description
 * answers the obvious question — is inside their control this afternoon.
 *
 * Every row LINKS TO THE EDITOR, not to the storefront. A report that ends in
 * "…and now go and find that product in your catalogue" is a report that gets
 * read once.
 *
 * The HINT is derived from the row, not chosen by the reader: one photo, a
 * two-line description. Cheapest fix first, and price LAST — it is the only
 * suggestion that costs the shop money, and leading with it is bad advice.
 */
export async function ViewsWithoutSales({
  shopId,
  period,
}: {
  shopId: string;
  period: ReportPeriod;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopReports.views');
  const rows = await viewsWithoutSales(shopId, period);

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<Eye className="h-7 w-7" aria-hidden />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  return (
    <>
      {/*
        CARDS ON A PHONE, TABLE FROM `md` (Prompt: the advice column was
        invisible at 390px).
        Five columns cannot be made to fit a 390px screen, so the table scrolled
        sideways — and the column that fell off the end was the LAST one, the
        only cell that says what to DO about the row. A shopkeeper on the shop
        floor was left with four numbers and no instruction. The card keeps the
        same reading order top-to-bottom: which product, the one number that
        matters, what to try, and a button that goes and does it.
      */}
      <ul className="space-y-3 md:hidden" data-report-cards>
        {rows.map((row) => (
          <li
            key={row.id}
            data-report-row
            className="rounded-card border-border bg-card space-y-3 border p-3"
          >
            <div className="flex items-start gap-3">
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
                {/* User-generated: a Dari title in an English UI (or the
                    reverse) has to set its own base direction. */}
                <span className="clamp-2 block text-sm font-medium" dir="auto">
                  {pickLocale(row.title, locale)}
                </span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {formatCurrency(row.price, locale)}
                </span>
              </span>
            </div>

            {/* Three figures as labelled cells rather than one sentence: a
                sentence of three numbers shatters under bidi. */}
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-control bg-neutral-50 py-2">
                <dt className="text-2xs text-neutral-500">{t('views')}</dt>
                <dd className="text-sm font-bold tabular-nums">
                  {formatNumber(row.views, locale)}
                </dd>
              </div>
              <div className="rounded-control bg-neutral-50 py-2">
                <dt className="text-2xs text-neutral-500">{t('orders')}</dt>
                <dd className="text-sm font-bold tabular-nums">
                  {formatNumber(row.orders, locale)}
                </dd>
              </div>
              <div className="rounded-control bg-neutral-50 py-2">
                <dt className="text-2xs text-neutral-500">{t('conversion')}</dt>
                <dd className="text-sm font-bold tabular-nums">
                  {formatPercent(row.conversion, locale, 2)}
                </dd>
              </div>
            </dl>

            <p className="rounded-control bg-primary-50 text-primary-900 flex items-start gap-2 p-2.5 text-xs font-medium">
              <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t(`hints.${row.hint}` as never)}</span>
            </p>

            <Link
              href={`/dashboard/products/${row.id}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {t('fixAction')}
            </Link>
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
                <th className="px-3 py-2.5 text-end text-xs font-semibold">{t('views')}</th>
                <th className="px-3 py-2.5 text-end text-xs font-semibold">{t('orders')}</th>
                <th className="px-3 py-2.5 text-end text-xs font-semibold">{t('conversion')}</th>
                <th className="px-4 py-2.5 text-start text-xs font-semibold">{t('hint')}</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((row) => (
                <tr key={row.id} data-report-row>
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
                  <td className="px-3 py-2.5 text-end font-semibold tabular-nums">
                    {formatNumber(row.views, locale)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatNumber(row.orders, locale)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatPercent(row.conversion, locale, 2)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/products/${row.id}`}
                      className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                    >
                      <Pencil className="h-3 w-3" aria-hidden />
                      {t(`hints.${row.hint}` as never)}
                    </Link>
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
