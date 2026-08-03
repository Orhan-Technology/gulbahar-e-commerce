import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, ImageOff, MapPin, Phone, Store, Truck, User } from 'lucide-react';

import { CancelOrderDialog } from '@/components/admin/cancel-order-dialog';
import { OrderStatusTimeline } from '@/components/custom/order-status-timeline';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminOrderAging } from '@/lib/db/queries/admin';
import { orderWithTimeline } from '@/lib/db/queries/orders';
import { formatCurrency, formatDateTime, formatNumber, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { parseReasonNote } from '@/lib/order-reject-reasons';
import { SLA_HOURS } from '@/lib/queue-sla';
import type { OrderStatus } from '@/lib/db/schema';

/** The statuses an order can still be ended from — the same set the action enforces. */
const CANCELLABLE: OrderStatus[] = ['placed', 'accepted', 'ready'];

/**
 * Order detail with the full event chain (PRD §7.4).
 *
 * Unlike the shopkeeper's version this shows EVERY shop's lines, because admin
 * oversight of a multi-shop basket is the whole point.
 *
 * STILL READ-ONLY ABOUT FULFILMENT: there is no accept, no ready and no fulfil
 * anywhere on this page, because advancing an order is the shop's decision
 * (PRD §3.1). The single exception is CANCELLATION, and it is an exception on
 * purpose — ending a transaction the platform is hosting is a platform
 * decision, not a fulfilment one, and until it existed an order a shop had
 * abandoned could only be nudged, forever. The read-only badge stays, because
 * it is still true of everything else on the screen.
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
  // The reason CODES are authored once, under the shopkeeper's namespace, and
  // read by every screen that shows a timeline — a second copy under
  // `adminOrders` would drift from the sentence the customer was sent.
  const tReasons = await getTranslations('shopOrders.rejectReasons');

  const order = await orderWithTimeline(id);
  if (!order) notFound();

  /*
   * HOW LATE THIS ORDER IS (Prompt C4). Read as a separate query rather than
   * derived here: a component may not call the clock during render, and the
   * hours have to be measured against the database's `now()` — the same one the
   * overview's stalled-order rule uses — or the two screens can disagree about
   * whether the same order is late.
   */
  const aging = await adminOrderAging(order.id);
  const stalled =
    aging !== null &&
    order.status === 'placed' &&
    aging.pendingHours >= SLA_HOURS.warning;

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
        <div className="flex flex-wrap items-center gap-2">
          {/* No fulfilment control: that belongs to the shop (PRD §3.1). */}
          <Badge variant="outline">{t('readOnly')}</Badge>
          {CANCELLABLE.includes(order.status) && (
            <CancelOrderDialog
              orderId={order.id}
              reference={order.reference}
              variant="outline"
              size="sm"
            />
          )}
        </div>
      </div>

      {/*
        THE STALL BANNER. The overview says an order has been unanswered for two
        days and links here; before this the detail page said nothing at all, so
        the one screen with the shop's phone number on it was also the one that
        had forgotten why the admin opened it. Amber past 24 hours, red past 48
        — the shared thresholds, never a number of its own (lib/queue-sla.ts).
      */}
      {stalled && (
        <section
          data-order-stalled={aging.pendingHours >= SLA_HOURS.danger ? 'danger' : 'warning'}
          className={
            aging.pendingHours >= SLA_HOURS.danger
              ? 'rounded-card border-danger-border bg-danger-bg border-s-4 p-4'
              : 'rounded-card border-warning-border bg-warning-bg border-s-4 p-4'
          }
        >
          <p
            className={
              aging.pendingHours >= SLA_HOURS.danger
                ? 'text-danger text-sm font-bold'
                : 'text-warning-fg text-sm font-bold'
            }
          >
            {aging.pendingHours >= 48
              ? t('stalledDays', {
                  n: Math.floor(aging.pendingHours / 24),
                  count: formatNumber(Math.floor(aging.pendingHours / 24), locale),
                })
              : t('stalledHours', {
                  n: Math.floor(aging.pendingHours),
                  count: formatNumber(Math.floor(aging.pendingHours), locale),
                })}
          </p>
          <p
            className={
              aging.pendingHours >= SLA_HOURS.danger
                ? 'text-danger/90 mt-1 text-xs leading-relaxed'
                : 'text-warning-fg/80 mt-1 text-xs leading-relaxed'
            }
          >
            {t('stalledBody')}
          </p>
        </section>
      )}

      <section className="rounded-card border-border bg-card border p-4">
        {/*
          `cancelled` is TERMINAL AND OFF THE HAPPY PATH, so it gets the same
          treatment `rejected` gets rather than a row of steps none of which
          will ever complete. OrderStatusTimeline's own prop type predates the
          status, which is also why the branch is here and not inside it.
        */}
        {order.status === 'cancelled' ? (
          <div className="flex items-start gap-3">
            <span className="bg-neutral-200 mt-1 h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden />
            <div>
              <p className="text-sm font-semibold">{t('status.cancelled')}</p>
              <p className="text-muted-foreground text-xs">{t('cancelledHint')}</p>
            </div>
          </div>
        ) : (
          <OrderStatusTimeline status={order.status} />
        )}
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
            {/*
              SHOWN FOR EVERY DELIVERY, INCLUDING A FREE ONE. Hidden at zero, the
              totals silently stopped adding up for anyone checking them: the
              subtotal, the discount and the total were on screen and the line
              that reconciled them was not. «رایگان» is a fact about this order;
              a missing row is a gap the reader has to explain to themselves.
            */}
            {(order.deliveryFee > 0 || order.fulfillment === 'delivery') && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('deliveryFee')}</dt>
                <dd>
                  {order.deliveryFee > 0
                    ? formatCurrency(order.deliveryFee, locale)
                    : t('deliveryFree')}
                </dd>
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
              {order.events.map((event) => {
                /*
                 * The note is stored as `reason:<code> — <words>` on the
                 * shopkeeper's paths (order_events has one note column and the
                 * prefix stands in for a second). Rendered raw it reads
                 * `reason:out_of_stock` on an admin's screen, so it is split
                 * back apart here — the code through the translated list, the
                 * words as written. An admin cancellation carries no code and
                 * comes through as text, which is exactly right.
                 */
                const { code, text } = parseReasonNote(event.note);
                return (
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
                      {/*
                        THE REASON, AS PROMINENT AS THE DIALOG PROMISED IT WOULD
                        BE (Prompt C7). Cancelling an order demands ten
                        characters of written explanation and tells the admin it
                        reaches the customer verbatim — and then the history
                        rendered it as one more line of 12px grey, the same
                        weight as the timestamp above it. A stated reason that is
                        hard to find later is a form field, not a record.
                      */}
                      {(code || text) && (
                        <div
                          data-event-reason
                          className="rounded-control border-border mt-1.5 border-s-2 bg-neutral-50 p-2"
                        >
                          {code && (
                            <p className="text-xs font-bold">{tReasons(code as never)}</p>
                          )}
                          {text && (
                            <p className={code ? 'mt-0.5 text-xs' : 'text-xs font-medium'}>
                              «{text}»
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
