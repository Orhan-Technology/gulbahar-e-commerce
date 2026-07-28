import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, ImageOff, MapPin, Phone, Store, Truck, User } from 'lucide-react';

import { OrderStatusTimeline } from '@/components/custom/order-status-timeline';
import { LiveRefresh } from '@/components/dashboard/live-refresh';
import { OrderActions } from '@/components/dashboard/orders/order-actions';
import { Badge } from '@/components/ui/badge';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopOrderDetail } from '@/lib/db/queries/shop-orders';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/** Shopkeeper order detail (PRD §6.3). */
export default async function ShopOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopOrders');

  // Scoped by shopId inside the query: an order this shop has no line in is
  // simply not found.
  const order = await shopOrderDetail(user.shopId, id);
  if (!order) notFound();

  return (
    <div className="space-y-4 p-4">
      <LiveRefresh />

      <nav className="text-muted-foreground flex items-center gap-1 text-xs">
        <Link href="/dashboard/orders" className="hover:text-primary">
          {t('title')}
        </Link>
        <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
        <span className="text-foreground" dir="ltr">
          {order.reference}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-bold" dir="ltr">
            {order.reference}
          </h1>
          <p className="text-muted-foreground text-xs">{formatDateTime(order.createdAt, locale)}</p>
        </div>
        <OrderActions orderId={order.id} status={order.status} />
      </div>

      <section className="rounded-card border-border bg-card border p-4">
        <OrderStatusTimeline status={order.status} />
      </section>

      {order.shopCount > 1 && (
        <p className="rounded-card border-warning-border bg-warning-bg text-warning p-3 text-xs">
          {t('sharedOrderNote')}
        </p>
      )}

      {/* Items — this shop's lines only */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">{t('itemsHeading')}</h2>
          <span className="text-muted-foreground text-xs">
            {t('itemCount', {
              count: formatNumber(
                order.items.reduce((sum, item) => sum + item.quantity, 0),
                locale,
              ),
            })}
          </span>
        </div>

        <ul className="divide-border divide-y">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="rounded-control relative h-14 w-14 shrink-0 overflow-hidden bg-neutral-100">
                {item.imagePath ? (
                  <Image src={item.imagePath} alt="" fill sizes="56px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-neutral-400">
                    <ImageOff className="h-5 w-5" aria-hidden />
                  </span>
                )}
              </span>

              <div className="min-w-0 flex-1">
                {/* The snapshot, not the live product — a later rename must not
                    rewrite order history (see lib/db/schema/orders.ts). */}
                {item.productSlug ? (
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="hover:text-primary clamp-1 text-sm font-medium"
                  >
                    {pickLocale(item.titleSnapshot, locale)}
                  </Link>
                ) : (
                  <span className="clamp-1 text-sm font-medium">
                    {pickLocale(item.titleSnapshot, locale)}
                  </span>
                )}
                {item.variantSelection && item.variantSelection.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {item.variantSelection.join(' · ')}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  {formatNumber(item.quantity, locale)} ×{' '}
                  {formatCurrency(item.priceSnapshot, locale)}
                </p>
              </div>

              <span className="shrink-0 text-sm font-medium">
                {formatCurrency(item.priceSnapshot * item.quantity, locale)}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-border flex items-center justify-between border-t pt-3 text-sm font-bold">
          <span>{t('shopSubtotal')}</span>
          <span>{formatCurrency(order.shopSubtotal, locale)}</span>
        </div>
      </section>

      {/* Customer and fulfilment */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-card border-border bg-card space-y-2 border p-4">
          <h2 className="text-sm font-bold">{t('customerHeading')}</h2>
          <p className="flex items-center gap-2 text-sm">
            <User className="text-muted-foreground h-4 w-4" aria-hidden />
            {order.customerName}
          </p>
          <a
            href={`tel:${order.customerPhone}`}
            className="hover:text-primary flex items-center gap-2 text-sm"
          >
            <Phone className="text-muted-foreground h-4 w-4" aria-hidden />
            <span dir="ltr">{order.customerPhone}</span>
          </a>
        </section>

        <section className="rounded-card border-border bg-card space-y-2 border p-4">
          <h2 className="text-sm font-bold">{t('fulfillmentHeading')}</h2>
          <p className="flex items-center gap-2 text-sm">
            {order.fulfillment === 'delivery' ? (
              <Truck className="text-muted-foreground h-4 w-4" aria-hidden />
            ) : (
              <Store className="text-muted-foreground h-4 w-4" aria-hidden />
            )}
            {t(`fulfillment.${order.fulfillment}`)}
          </p>

          {order.fulfillment === 'delivery' && order.addressDistrict && (
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {order.addressLabel && (
                  <span className="text-foreground">{order.addressLabel} · </span>
                )}
                {order.addressDistrict}
                {order.addressStreet ? ` — ${order.addressStreet}` : ''}
              </span>
            </p>
          )}

          {/* Not a <p>: Badge renders a <div>, which the parser hoists out of a
              paragraph and turns into a hydration error. */}
          <div className="text-sm">
            <Badge variant={order.paymentMethod === 'cod' ? 'secondary' : 'default'}>
              {t(`payment.${order.paymentMethod}`)}
            </Badge>
          </div>
        </section>
      </div>

      {/* Event chain — the append-only log, shown as history */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('historyHeading')}</h2>
        <ol className="space-y-3">
          {order.events.map((event) => (
            <li key={event.id} className="flex gap-3">
              <span className="bg-primary-100 mt-1.5 h-2 w-2 shrink-0 rounded-full" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">{t(`status.${event.toStatus}`)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(event.createdAt, locale)}
                  {event.actorName ? ` · ${event.actorName}` : ''}
                </p>
                {event.note && <p className="mt-1 text-xs">{event.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
