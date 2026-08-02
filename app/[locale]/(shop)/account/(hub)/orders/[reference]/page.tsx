import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Banknote, MapPin, Smartphone, Store } from 'lucide-react';

import { OrderStatusTimeline } from '@/components/custom/order-status-timeline';
import { CancelOrderButton } from '@/components/shop/order/cancel-order-button';
import { CollectionPanel } from '@/components/shop/account/collection-panel';
import { RateShopsPrompt } from '@/components/shop/account/rate-shops-prompt';
import { ReorderButton } from '@/components/shop/account/reorder-button';
import { OrderItemReviewPrompt } from '@/components/shop/reviews/order-item-review-prompt';
import { requireUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { orderByReference } from '@/lib/db/queries/orders';
import { parseReasonNote } from '@/lib/order-reject-reasons';
import { siteSettings } from '@/lib/db/queries/settings';
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
  // The shop's reason list is authored once, under the shop's namespace, and
  // read here so the customer sees the same sentence their SMS was built from.
  const tReasons = await getTranslations('shopOrders.rejectReasons');

  const session = await requireUser(locale);
  const order = await orderByReference(reference);

  // Scoped to the owner; another customer's reference must not resolve.
  if (!order || order.customerId !== session.id) notFound();

  const shops = [...new Map(order.items.map((item) => [item.shopId, item])).values()];
  const settings = await siteSettings();
  const collectFrom = shops[0];

  return (
    // The hub layout owns the page frame (Prompt A2).
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-bold tabular-nums">{order.reference}</h1>
          <p className="text-muted-foreground text-xs">{formatDateTime(order.createdAt, locale)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Only while nobody has committed anything — see the component. */}
          {order.status === 'placed' && <CancelOrderButton orderId={order.id} />}
          <ReorderButton reference={order.reference} />
        </div>
      </div>

      {/*
        THE WAY OUT, once the button is gone. An order the shop has accepted can
        still be stopped — by ringing the shop, which is a thing this mall's
        customers do anyway — and saying so is the difference between "you
        cannot cancel" and "here is how".
      */}
      {(order.status === 'accepted' || order.status === 'ready') && (
        <p className="rounded-card border-border bg-neutral-50 text-muted-foreground border p-3 text-xs">
          {t('cancel.tooLateHint')}
        </p>
      )}

      {/*
        The collection code, ABOVE the timeline (Prompt C11). It is the only
        thing on this page used standing up, so it comes before the history.
      */}
      {order.collectionCode && order.status === 'ready' && collectFrom && (
        <CollectionPanel
          code={order.collectionCode}
          expiresAt={order.holdExpiresAt}
          shopName={pickLocale(collectFrom.shopName, locale)}
          floor={collectFrom.shopFloor}
          unitNumber={collectFrom.shopUnitNumber}
          mallHours={settings.hours}
        />
      )}

      <section className="rounded-card border-border bg-card border p-4">
        {/*
          Times come from the immutable order_events chain, not from guesses:
          each transition wrote a row when it happened (lib/actions/shop-orders.ts),
          so the stepper is a record rather than an illustration.
        */}
        <OrderStatusTimeline
          status={order.status}
          orientation="vertical"
          timestamps={Object.fromEntries(
            order.events.map((event) => [event.toStatus, formatDateTime(event.createdAt, locale)]),
          )}
        />
      </section>

      {/* "How was it?" — the shop-service review, offered once the order is
          done and gone once it is written (Prompt C8). */}
      {order.status === 'fulfilled' && (
        <RateShopsPrompt
          orderId={order.id}
          orderReference={order.reference}
          userId={session.id}
        />
      )}

      {/*
        And the PRODUCTS, which is a different question from the service above.
        Asking here rather than only on the product page is the whole point: the
        customer is holding the thing, and they are already on a screen that
        knows exactly which items they are entitled to review. Each prompt
        disappears as it is answered.
      */}
      {order.status === 'fulfilled' && (
        <OrderItemReviewPrompt orderId={order.id} userId={session.id} />
      )}

      {/* The append-only event chain, which is the audit trail (PRD §14) */}
      {order.events.length > 1 && (
        <section className="rounded-card border-border bg-card space-y-2 border p-4">
          <h2 className="text-sm font-bold">{t('historyHeading')}</h2>
          <ol className="space-y-1.5 text-xs">
            {order.events.map((event) => {
              /*
               * The note carries an internal code — `reason:out_of_stock` — and
               * the customer must read a sentence, not a token. Translated into
               * THEIR language here, which is the same string the SMS was
               * written from.
               */
              const reason = parseReasonNote(event.note);
              const words = [reason.code ? tReasons(reason.code) : null, reason.text]
                .filter(Boolean)
                .join(' — ');

              return (
                <li key={event.id} className="flex items-baseline gap-2">
                  <span className="text-foreground font-medium">{tStatus(event.toStatus)}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(event.createdAt, locale)}
                  </span>
                  {words && <span className="text-muted-foreground">— {words}</span>}
                </li>
              );
            })}
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
