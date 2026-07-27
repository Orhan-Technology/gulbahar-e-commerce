import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckCircle2, MapPin, Package, Store } from 'lucide-react';

import { OrderStatusTimeline } from '@/components/custom/order-status-timeline';
import { Button } from '@/components/ui/button';
import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { orderByReference } from '@/lib/db/queries/orders';
import { formatCurrency } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Order confirmation (PRD §5.3, §10.5).
 *
 * Gets a celebratory beat rather than a redirect: placing the order is the payoff
 * of the storefront journey, and the PRD is explicit that success states are where
 * demos are won.
 */
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; reference: string }>;
}) {
  const { locale, reference } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('confirmation');

  const order = await orderByReference(reference);
  const user = await currentUser();

  // Only the customer who placed it may see it.
  if (!order || !user?.id || order.customerId !== user.id) notFound();

  const shops = [...new Map(order.items.map((item) => [item.shopId, item])).values()];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* The celebratory beat */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="animate-heart-pop rounded-pill bg-success text-success-fg flex h-16 w-16 items-center justify-center">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>

        <p className="rounded-card border-border bg-card border px-4 py-2 font-mono text-lg font-bold tabular-nums">
          {order.reference}
        </p>
      </div>

      <section className="rounded-card border-border bg-card border p-4">
        <OrderStatusTimeline status={order.status} />
      </section>

      {/* What happens next, in plain language (PRD §5.3) */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('nextHeading')}</h2>
        <ol className="text-muted-foreground space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="text-primary font-bold">۱.</span>
            {t('next1')}
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">۲.</span>
            {t('next2')}
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-bold">۳.</span>
            {order.fulfillment === 'pickup' ? t('next3Pickup') : t('next3Delivery')}
          </li>
        </ol>
      </section>

      {/* Where to collect, per shop, when picking up */}
      {order.fulfillment === 'pickup' && (
        <section className="rounded-card border-primary-200 bg-primary-50 space-y-2 border p-4">
          <h2 className="text-primary-900 flex items-center gap-1.5 text-sm font-bold">
            <Store className="h-4 w-4" aria-hidden />
            {t('collectHeading')}
          </h2>
          <ul className="space-y-1.5 text-sm">
            {shops.map((item) => (
              <li key={item.shopId} className="text-primary-900 flex items-center gap-2">
                <span className="truncate font-medium">{pickLocale(item.shopName, locale)}</span>
                {item.shopFloor !== null && (
                  <span className="ms-auto flex shrink-0 items-center gap-1 text-xs">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {t('floorUnit', { floor: item.shopFloor, unit: item.shopUnitNumber ?? '—' })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-card border-border bg-card space-y-2 border p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('itemsTotal')}</span>
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg" className="flex-1">
          <Link href={`/account/orders/${order.reference}`}>
            <Package />
            {t('trackOrder')}
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="flex-1">
          <Link href="/products">{t('keepShopping')}</Link>
        </Button>
      </div>
    </div>
  );
}
