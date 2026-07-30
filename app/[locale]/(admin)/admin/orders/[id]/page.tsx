import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, ImageOff, MapPin, Phone, Store, Truck, User } from 'lucide-react';

import { OrderStatusTimeline } from '@/components/custom/order-status-timeline';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { orderWithTimeline } from '@/lib/db/queries/orders';
import { formatCurrency, formatDateTime, formatNumber, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Read-only order detail with the full event chain (PRD §7.4).
 *
 * Unlike the shopkeeper's version this shows EVERY shop's lines, because admin
 * oversight of a multi-shop basket is the whole point. Still read-only: no status
 * control appears anywhere, since advancing an order is the shop's decision.
 */
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminOrders');

  const order = await orderWithTimeline(id);
  if (!order) notFound();

  // Grouped by shop, which is how a multi-shop order is actually fulfilled.
  const byShop = new Map<string, typeof order.items>();
  for (const item of order.items) {
    const existing = byShop.get(item.shopId);
    if (existing) existing.push(item);
    else byShop.set(item.shopId, [item]);
  }

  return (
    <div className="space-y-5 p-6">
      <nav className="text-muted-foreground flex items-center gap-1 text-xs">
        <Link href="/admin/orders" className="hover:text-primary">
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
        {/* No status control: fulfilment belongs to the shop (PRD §3.1). */}
        <Badge variant="outline">{t('readOnly')}</Badge>
      </div>

      <section className="rounded-card border-border bg-card border p-4">
        <OrderStatusTimeline status={order.status} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border-border bg-card space-y-4 border p-4 lg:col-span-2">
          <h2 className="text-sm font-bold">
            {t('itemsHeading', { count: formatNumber(byShop.size, locale) })}
          </h2>

          {[...byShop.entries()].map(([shopId, items]) => (
            <div key={shopId} className="space-y-2">
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/shops/${shopId}`}
                  className="hover:text-primary text-xs font-bold"
                >
                  {pickLocale(items[0].shopName, locale)}
                </Link>
                {items[0].shopFloor !== null && (
                  <span className="text-muted-foreground text-xs">
                    {t('floorUnit', {
                      floor: formatNumber(items[0].shopFloor, locale),
                      unit: items[0].shopUnitNumber ?? '—',
                    })}
                  </span>
                )}
              </div>

              <ul className="divide-border divide-y">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-3 py-2">
                    <span className="rounded-control relative h-12 w-12 shrink-0 overflow-hidden bg-neutral-100">
                      {item.imagePath ? (
                        <Image
                          src={item.imagePath}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-neutral-400">
                          <ImageOff className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* The snapshot, not the live product. */}
                      <p className="clamp-1 text-sm">{pickLocale(item.titleSnapshot, locale)}</p>
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
            </div>
          ))}

          <dl className="border-border space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('subtotal')}</dt>
              <dd>{formatCurrency(order.subtotal, locale)}</dd>
            </div>
            {order.discountTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('discount')}</dt>
                <dd className="text-accent-700">−{formatCurrency(order.discountTotal, locale)}</dd>
              </div>
            )}
            {order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('deliveryFee')}</dt>
                <dd>{formatCurrency(order.deliveryFee, locale)}</dd>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <dt>{t('total')}</dt>
              <dd>{formatCurrency(order.total, locale)}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-4">
          <section className="rounded-card border-border bg-card space-y-2 border p-4">
            <h2 className="text-sm font-bold">{t('customerHeading')}</h2>
            <p className="flex items-center gap-2 text-sm">
              <User className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
              {order.customerName}
            </p>
            <p className="flex items-center gap-2 text-sm" dir="ltr">
              <Phone className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
              {formatPhone(order.customerPhone, locale)}
            </p>
            <p className="flex items-center gap-2 text-sm">
              {order.fulfillment === 'delivery' ? (
                <Truck className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <Store className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
              )}
              {t(`fulfillment.${order.fulfillment}`)}
            </p>
            {order.addressDistrict && (
              <p className="text-muted-foreground flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {order.addressDistrict}
                  {order.addressStreet ? ` — ${order.addressStreet}` : ''}
                </span>
              </p>
            )}
            <Badge variant={order.paymentMethod === 'cod' ? 'secondary' : 'default'}>
              {t(`payment.${order.paymentMethod}`)}
            </Badge>
          </section>

          <section className="rounded-card border-border bg-card space-y-3 border p-4">
            <h2 className="text-sm font-bold">{t('historyHeading')}</h2>
            <ol className="space-y-3">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span
                    className="bg-primary-100 mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(`status.${event.toStatus}`)}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(event.createdAt, locale)}
                      {event.actorName ? ` · ${event.actorName}` : ` · ${t('systemActor')}`}
                    </p>
                    {event.note && <p className="mt-1 text-xs">{event.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
