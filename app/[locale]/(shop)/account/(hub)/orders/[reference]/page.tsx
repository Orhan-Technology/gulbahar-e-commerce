import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Banknote, MapPin, Phone, Smartphone, Store } from 'lucide-react';

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
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPhone,
  formatUnitNumber,
} from '@/lib/format';
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

  /*
   * The events that carry a REASON, which is the only thing the visual timeline
   * cannot show (finding #11).
   *
   * The note holds an internal code — `reason:out_of_stock` — and the customer
   * must read a sentence, not a token, so it is translated into THEIR language
   * here, from the same authored list the shop's SMS was written from.
   */
  const annotated = order.events
    .map((event) => {
      const reason = parseReasonNote(event.note);
      const words = [reason.code ? tReasons(reason.code) : null, reason.text]
        .filter(Boolean)
        .join(' — ');
      return { event, words };
    })
    .filter((row) => row.words.length > 0);

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
          {order.status === 'placed' && (
            <CancelOrderButton
              orderId={order.id}
              reference={order.reference}
              // Formatted here: the button is a client component and every
              // number on the storefront is shaped by lib/format on the server.
              total={formatCurrency(order.total, locale)}
            />
          )}
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
        <div className="rounded-card border-border text-muted-foreground space-y-2 border bg-neutral-50 p-3 text-xs">
          <p>{t('cancel.tooLateHint')}</p>
          {/* …and the number to ring, since the sentence above is an
              instruction to ring. Same fix as the collection panel's. */}
          {collectFrom?.shopPhone && (
            <a
              href={`tel:${collectFrom.shopPhone}`}
              className="rounded-control border-border bg-card hover:border-primary hover:text-primary inline-flex items-center gap-1.5 border px-3 py-1.5 font-semibold transition-colors duration-150"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="tabular-nums" dir="ltr">
                {formatPhone(collectFrom.shopPhone, locale)}
              </span>
            </a>
          )}
        </div>
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
          shopPhone={collectFrom.shopPhone}
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

      {/*
        The append-only event chain, which is the audit trail (PRD §14) — but
        ONLY WHEN IT SAYS SOMETHING THE TIMELINE DOES NOT (finding #11).

        The stepper above already carries every transition WITH its timestamp,
        so on an ordinary order this section reprinted the same four rows in a
        duller typeface directly underneath — «سیر سفارش» reading as a second,
        contradictory-looking copy of the thing immediately above it.

        What the stepper genuinely cannot show is a REASON: why a shop refused,
        what note came with a cancellation. Those rows are the audit trail
        earning its place, so the section renders when at least one event
        carries one, and only those rows are listed.
      */}
      {annotated.length > 0 && (
        <section className="rounded-card border-border bg-card space-y-2 border p-4">
          <h2 className="text-sm font-bold">{t('historyHeading')}</h2>
          <ol className="space-y-1.5 text-xs">
            {annotated.map(({ event, words }) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-foreground font-medium">{tStatus(event.toStatus)}</span>
                <span className="text-muted-foreground">
                  {formatDateTime(event.createdAt, locale)}
                </span>
                <span className="text-muted-foreground">— {words}</span>
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
                {/* Chips, not `join(' · ')`: the middle dot ran into the
                    Persian numeral of the next value and read as a leading
                    zero. Separate elements need no separator glyph. */}
                {item.variantSelection && item.variantSelection.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {item.variantSelection.map((value) => (
                      <li
                        key={value}
                        className="rounded-pill text-2xs bg-neutral-100 px-2 py-0.5 text-neutral-600"
                      >
                        {value}
                      </li>
                    ))}
                  </ul>
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
                    {/* Both numbers through lib/format. The unit is a STRING in
                        the schema, so it does not pass through ICU's number
                        formatting the way `floor` does — interpolated raw it
                        left «دکان 214» sitting in Persian prose, Latin digits
                        and all, three lines under a collection panel that
                        renders the same unit as «۲۱۴». */}
                    {t('floorUnit', {
                      floor: formatNumber(item.shopFloor, locale),
                      unit: formatUnitNumber(item.shopUnitNumber, locale) || '—',
                    })}
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
