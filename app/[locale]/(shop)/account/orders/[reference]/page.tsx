import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Banknote, MapPin, Smartphone, Store } from 'lucide-react';

import { OrderStatusTimeline } from '@/components/custom/order-status-timeline';
import { ReorderButton } from '@/components/shop/account/reorder-button';
import { requireUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { orderByReference } from '@/lib/db/queries/orders';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Order tracking (PRD §5.4).
 *
 * The timeline animates as the status advances, which is what the demo's closing
 * shot shows while the presenter moves the order along from the control panel
 * (PRD §9.5).
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; reference: string }>;
}) {
  const { locale, reference } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('orders');
  const tStatus = await getTranslations('order.status');

  const session = await requireUser(locale);
  const order = await orderByReference(reference);

  // Scoped to the owner; another customer's reference must not resolve.
  if (!order || order.customerId !== session.id) notFound();

  const shops = [...new Map(order.items.map((item) => [item.shopId, item])).values()];

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-bold tabular-nums">{order.reference}</h1>
          <p className="text-muted-foreground text-xs">{formatDateTime(order.createdAt, locale)}</p>
        </div>
        <ReorderButton reference={order.reference} />
      </div>

      <section className="rounded-card border-border bg-card border p-4">
        <OrderStatusTimeline status={order.status} />
      </section>

      {/* The append-only event chain, which is the audit trail (PRD §14) */}
      {order.events.length > 1 && (
        <section className="rounded-card border-border bg-card space-y-2 border p-4">
          <h2 className="text-sm font-bold">{t('historyHeading')}</h2>
          <ol className="space-y-1.5 text-xs">
            {order.events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-2">
                <span className="text-foreground font-medium">{tStatus(event.toStatus)}</span>
                <span className="text-muted-foreground">
                  {formatDateTime(event.createdAt, locale)}
                </span>
                {event.note && <span className="text-muted-foreground">— {event.note}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Items, grouped visually by shop line */}
      <section className="rounded-card border-border bg-card overflow-hidden border">
        <h2 className="border-border border-b bg-neutral-50 px-4 py-2.5 text-sm font-bold">
          {t('itemsHeading')}
        </h2>
        <ul className="divide-border divide-y">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-3 p-4">
              <span className="rounded-control relative h-16 w-16 shrink-0 overflow-hidden bg-neutral-100">
                {item.imagePath && (
                  <Image src={item.imagePath} alt="" fill sizes="64px" className="object-cover" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {item.productSlug ? (
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="clamp-2 hover:text-primary text-sm font-medium"
                  >
                    {pickLocale(item.titleSnapshot, locale)}
                  </Link>
                ) : (
                  <span className="clamp-2 text-sm font-medium">
                    {pickLocale(item.titleSnapshot, locale)}
                  </span>
                )}
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {pickLocale(item.shopName, locale)}
                </p>
                {item.variantSelection && item.variantSelection.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {item.variantSelection.join(' · ')}
                  </p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">
                  {formatNumber(item.quantity, locale)} ×{' '}
                  {formatCurrency(item.priceSnapshot, locale)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {formatCurrency(item.priceSnapshot * item.quantity, locale)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Fulfilment and payment */}
      <section className="rounded-card border-border bg-card space-y-2 border p-4 text-sm">
        <h2 className="text-sm font-bold">{t('fulfillmentHeading')}</h2>

        {order.fulfillment === 'delivery' ? (
          <p className="text-muted-foreground flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {order.addressLabel && <span className="font-medium">{order.addressLabel} — </span>}
              {order.addressDistrict}
              {order.addressStreet ? `، ${order.addressStreet}` : ''}
            </span>
          </p>
        ) : (
          <ul className="space-y-1">
            {shops.map((item) => (
              <li key={item.shopId} className="text-muted-foreground flex items-center gap-2">
                <Store className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{pickLocale(item.shopName, locale)}</span>
                {item.shopFloor !== null && (
                  <span className="ms-auto shrink-0 text-xs">
                    {t('floorUnit', { floor: item.shopFloor, unit: item.shopUnitNumber ?? '—' })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-muted-foreground flex items-center gap-2">
          {order.paymentMethod === 'cod' ? (
            <Banknote className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {t(order.paymentMethod)}
        </p>
      </section>

      {/* Totals */}
      <section className="rounded-card border-border bg-card space-y-1.5 border p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('subtotal')}</span>
          <span className="tabular-nums">{formatCurrency(order.subtotal, locale)}</span>
        </div>
        {order.discountTotal > 0 && (
          <div className="text-success flex justify-between">
            <span>{t('discounts')}</span>
            <span className="tabular-nums">−{formatCurrency(order.discountTotal, locale)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('deliveryFee')}</span>
          <span className="tabular-nums">
            {order.deliveryFee === 0 ? t('free') : formatCurrency(order.deliveryFee, locale)}
          </span>
        </div>
        <div className="border-border flex justify-between border-t pt-2 text-base font-bold">
          <span>{t('total')}</span>
          <span className="tabular-nums">{formatCurrency(order.total, locale)}</span>
        </div>
      </section>
    </div>
  );
}
