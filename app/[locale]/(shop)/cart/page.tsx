import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MapPin, ShoppingCart, Store, Tag } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { PriceDisplay } from '@/components/custom/price-display';
import { Button } from '@/components/ui/button';
import { CartLineControls } from '@/components/shop/cart/cart-line-controls';
import { getCart } from '@/lib/cart';
import { siteSettings } from '@/lib/db/queries/settings';
import { pickLocale } from '@/lib/db/localized';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Cart (PRD §5.3). Grouped by shop, because a Gulbahar basket routinely spans
 * several tenants and each shop fulfils its own lines.
 */
export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('cart');

  const [cart, settings] = await Promise.all([getCart(), siteSettings()]);

  if (cart.groups.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          illustration={<ShoppingCart className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('startShopping'), href: '/products' }}
        />
      </div>
    );
  }

  const freeDeliveryGap = settings.freeDeliveryThreshold - cart.total;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">
        {t('title')} · {t('itemCount', { count: formatNumber(cart.itemCount, locale) })}
      </h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Shop groups */}
        <div className="space-y-4">
          {cart.groups.map((group) => (
            <section
              key={group.shopId}
              className="rounded-card border-border bg-card overflow-hidden border"
            >
              <header className="border-border flex items-center gap-2 border-b bg-neutral-50 px-4 py-2.5">
                <Store className="text-primary-700 h-4 w-4 shrink-0" aria-hidden />
                <Link
                  href={`/shops/${group.shopSlug}`}
                  className="hover:text-primary truncate text-sm font-semibold"
                >
                  {pickLocale(group.shopName, locale)}
                </Link>
                {group.shopFloor !== null && (
                  <span className="text-muted-foreground ms-auto flex shrink-0 items-center gap-1 text-xs">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {t('floorUnit', {
                      floor: formatNumber(group.shopFloor, locale),
                      unit: group.shopUnitNumber ?? '—',
                    })}
                  </span>
                )}
              </header>

              <ul className="divide-border divide-y">
                {group.lines.map((line) => (
                  <li key={line.productId} className="flex gap-3 p-4">
                    <Link
                      href={`/products/${line.slug}`}
                      className="rounded-control relative h-20 w-20 shrink-0 overflow-hidden bg-neutral-100"
                    >
                      {line.imagePath && (
                        <Image
                          src={line.imagePath}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Link
                        href={`/products/${line.slug}`}
                        className="clamp-2 hover:text-primary text-sm font-medium"
                      >
                        {pickLocale(line.title, locale)}
                      </Link>

                      {line.variantSelection && line.variantSelection.length > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {line.variantSelection.join(' · ')}
                        </p>
                      )}

                      <PriceDisplay
                        price={line.price}
                        discountPrice={line.discountPrice}
                        size="sm"
                      />

                      {line.stock <= 0 && (
                        <p className="text-danger text-xs font-medium">{t('lineOutOfStock')}</p>
                      )}

                      <CartLineControls
                        productId={line.productId}
                        quantity={line.quantity}
                        stock={line.stock}
                        variantSelection={line.variantSelection ?? null}
                      />
                    </div>

                    <div className="shrink-0 text-end text-sm font-semibold tabular-nums">
                      {formatCurrency(line.lineTotal, locale)}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Per-shop total, with the offer itemised (PRD §5.3) */}
              <footer className="border-border space-y-1 border-t px-4 py-3 text-sm">
                <div className="text-muted-foreground flex justify-between">
                  <span>{t('shopSubtotal')}</span>
                  <span className="tabular-nums">{formatCurrency(group.subtotal, locale)}</span>
                </div>

                {group.offer && (
                  <div className="text-success flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" aria-hidden />
                      {pickLocale(group.offer.name, locale)}
                    </span>
                    <span className="tabular-nums">
                      −{formatCurrency(group.offer.amount, locale)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between font-semibold">
                  <span>{t('shopTotal')}</span>
                  <span className="tabular-nums">{formatCurrency(group.total, locale)}</span>
                </div>
              </footer>
            </section>
          ))}
        </div>

        {/* Order summary */}
        <aside className="lg:sticky lg:top-[var(--sticky-offset)] lg:self-start">
          <div className="rounded-card border-border bg-card shadow-card space-y-3 border p-4">
            <h2 className="text-base font-bold">{t('summary')}</h2>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('subtotal')}</dt>
                <dd className="tabular-nums">{formatCurrency(cart.subtotal, locale)}</dd>
              </div>

              {cart.productSavings > 0 && (
                <div className="text-success flex justify-between">
                  <dt>{t('productSavings')}</dt>
                  <dd className="tabular-nums">−{formatCurrency(cart.productSavings, locale)}</dd>
                </div>
              )}

              {cart.offerSavings > 0 && (
                <div className="text-success flex justify-between">
                  <dt>{t('offerSavings')}</dt>
                  <dd className="tabular-nums">−{formatCurrency(cart.offerSavings, locale)}</dd>
                </div>
              )}

              <div className="border-border flex justify-between border-t pt-2 text-base font-bold">
                <dt>{t('total')}</dt>
                <dd className="tabular-nums">{formatCurrency(cart.total, locale)}</dd>
              </div>
            </dl>

            <p className="text-muted-foreground text-xs">{t('deliveryAtCheckout')}</p>

            {freeDeliveryGap > 0 && (
              <p className="rounded-control bg-primary-50 text-primary-800 px-3 py-2 text-xs">
                {t('freeDeliveryHint', {
                  amount: formatCurrency(freeDeliveryGap, locale),
                  fee: formatCurrency(settings.deliveryFee, locale),
                })}
              </p>
            )}

            <Button asChild size="lg" className="w-full">
              <Link href="/checkout">{t('checkout')}</Link>
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link href="/products">{t('continueShopping')}</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
