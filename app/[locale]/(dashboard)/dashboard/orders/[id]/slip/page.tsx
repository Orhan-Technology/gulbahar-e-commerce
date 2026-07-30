import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PrintButton } from '@/components/dashboard/orders/print-button';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopById } from '@/lib/db/queries/shops';
import { shopOrderDetail } from '@/lib/db/queries/shop-orders';
import { formatCurrency, formatDateTime, formatNumber, formatPhone, formatUnitNumber } from '@/lib/format';

/**
 * The pick / pack slip (Prompt C6).
 *
 * This is a PHYSICAL MALL. An assistant walks to a shelf with a piece of paper,
 * pulls the stock, and puts the paper in the bag — and none of that works from
 * a screen behind a login on a phone in someone else's pocket.
 *
 * Deliberately plain: no chrome, no navigation, no colour that costs ink. The
 * order reference is set large because it is the one string that gets read
 * aloud across a counter, and it stays LTR in both locales because it is an
 * identifier rather than prose.
 *
 * Print styles live in app/globals.css under `@media print`, so this page needs
 * no client-side layout logic at all — everything that must not print is marked
 * `print:hidden`.
 */
export default async function OrderSlipPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopOrders.slip');
  const orders = await getTranslations('shopOrders');

  const [order, shop] = await Promise.all([
    shopOrderDetail(user.shopId, id),
    shopById(user.shopId),
  ]);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-2xl p-6 print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-base font-bold">{t('title')}</h1>
        <PrintButton label={t('print')} />
      </div>

      <article className="border-border rounded-card border p-6 print:rounded-none print:border-0 print:p-0">
        <header className="border-border flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="min-w-0">
            <p className="text-lg font-bold">{shop ? pickLocale(shop.name, locale) : ''}</p>
            <p className="text-xs text-neutral-600">
              {shop?.floor !== null && shop?.floor !== undefined
                ? t('floorUnit', {
                    floor: formatNumber(shop.floor, locale),
                    unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                  })
                : ''}
            </p>
          </div>

          <div className="text-end">
            {/* The one string that gets read aloud across a counter. */}
            <p className="font-mono text-2xl font-bold tabular-nums" dir="ltr">
              {order.reference}
            </p>
            <p className="text-xs text-neutral-600">{formatDateTime(order.createdAt, locale)}</p>
          </div>
        </header>

        <section className="border-border grid gap-4 border-b py-4 sm:grid-cols-2">
          <div>
            <p className="text-2xs font-bold text-neutral-500 uppercase">{t('customer')}</p>
            <p className="text-sm font-medium">{order.customerName}</p>
            <p className="text-sm tabular-nums" dir="ltr">
              {formatPhone(order.customerPhone, locale)}
            </p>
          </div>

          <div>
            <p className="text-2xs font-bold text-neutral-500 uppercase">
              {orders(`fulfillment.${order.fulfillment}`)}
            </p>
            {order.fulfillment === 'delivery' && order.addressDistrict ? (
              <p className="text-sm leading-relaxed">
                {order.addressLabel} — {order.addressDistrict}
                <br />
                {order.addressStreet}
              </p>
            ) : (
              <p className="text-sm">{t('collectAtShop')}</p>
            )}
            <p className="mt-1 text-sm">{orders(`payment.${order.paymentMethod}`)}</p>
          </div>
        </section>

        <table className="w-full py-4 text-sm">
          <thead>
            <tr className="border-border border-b text-xs text-neutral-500">
              <th className="py-2 text-start font-normal">{t('item')}</th>
              <th className="py-2 text-center font-normal">{t('qty')}</th>
              <th className="py-2 text-end font-normal">{t('lineTotal')}</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="py-2">
                  {pickLocale(item.titleSnapshot, locale)}
                  {item.variantSelection && item.variantSelection.length > 0 && (
                    <span className="block text-xs text-neutral-500">
                      {item.variantSelection.join(' · ')}
                    </span>
                  )}
                </td>
                {/* Big and centred: this is the number the assistant counts. */}
                <td className="py-2 text-center text-base font-bold tabular-nums">
                  {formatNumber(item.quantity, locale)}
                </td>
                <td className="py-2 text-end tabular-nums">
                  {formatCurrency(item.priceSnapshot * item.quantity, locale)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-border border-t font-bold">
              <td className="py-2" colSpan={2}>
                {t('shopTotal')}
              </td>
              <td className="py-2 text-end tabular-nums">
                {formatCurrency(order.shopSubtotal, locale)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* A shared order: the paper must not imply the customer owes only this. */}
        {order.shopCount > 1 && (
          <p className="text-xs text-neutral-600">{t('sharedOrderNote')}</p>
        )}
      </article>
    </div>
  );
}
