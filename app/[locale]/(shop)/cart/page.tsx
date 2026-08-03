import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MapPin, ShoppingCart, Store, Tag } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { PriceDisplay } from '@/components/custom/price-display';
import { Button } from '@/components/ui/button';
import { CartLineControls } from '@/components/shop/cart/cart-line-controls';
import { FreeDeliveryBar } from '@/components/shop/cart/free-delivery-bar';
import { PopularFallback } from '@/components/shop/listing/popular-fallback';
import { getCart } from '@/lib/cart';
import { siteSettings } from '@/lib/db/queries/settings';
import { pickLocale } from '@/lib/db/localized';
import { formatCurrency, formatNumber, formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * At or below this many units left, the line says so. Owned by this server
 * file rather than exported from a `'use client'` module, where it would cross
 * the RSC boundary as a client reference and arrive as undefined (CLAUDE.md).
 */
const LOW_STOCK = 5;

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
      /*
        AN EMPTY BASKET IS A RECOVERABLE STATE, not a dead end (finding #17).

        A zero-result search already answers this with the popular band; a cart
        that offers only "start shopping" sends the customer back to a menu they
        have just declined. The SAME component, not a copy — it is the shared
        fallback the listing screens use, so the rail here cannot drift from the
        rail there.

        `layout="row"` for the same reason it uses one under an empty listing:
        this band is a consolation, not the page's subject, and a full grid
        would give the failure case three screens of height.
      */
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
        <EmptyState
          illustration={<ShoppingCart className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('startShopping'), href: '/products' }}
        />
        <PopularFallback heading={t('popularTitle')} layout="row" />
      </div>
    );
  }

  const freeDeliveryGap = settings.freeDeliveryThreshold - cart.total;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      {/*
        TWO ELEMENTS, NOT ONE STRING. This was «سبد خرید · ۴ قلم», and a middle
        dot immediately before a Persian numeral reads as «۰» in Vazirmatn —
        «۴ قلم» became «۰۴ قلم», i.e. forty items. The count is a subtitle, not
        part of the title, so it gets its own element and its own weight and no
        separator glyph is needed at all.
      */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <span className="text-muted-foreground text-sm">
          {t('itemCount', { count: formatNumber(cart.itemCount, locale) })}
        </span>
      </div>

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
                    {/* The unit is a STRING column, so ICU never localises its
                        digits the way it does `floor` — raw it printed «دکان
                        119» in Dari. Same call the checkout screen makes. */}
                    {t('floorUnit', {
                      floor: formatNumber(group.shopFloor, locale),
                      unit: formatUnitNumber(group.shopUnitNumber, locale) || '—',
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

                      {/*
                        CHIPS, not `join(' · ')`. The middle dot ran straight
                        into the Persian numeral of the next value and read as a
                        leading zero — «۴۲ · سرخ» became «۰۴۲ سرخ». Separate
                        elements need no separator glyph at all, and a selected
                        variant reads as a chosen value rather than as prose.
                      */}
                      {line.variantSelection && line.variantSelection.length > 0 && (
                        <ul className="flex flex-wrap gap-1">
                          {line.variantSelection.map((value) => (
                            <li
                              key={value}
                              className="rounded-pill text-2xs bg-neutral-100 px-2 py-0.5 text-neutral-600"
                            >
                              {value}
                            </li>
                          ))}
                        </ul>
                      )}

                      <PriceDisplay
                        price={line.price}
                        discountPrice={line.discountPrice}
                        size="sm"
                      />

                      {line.stock <= 0 ? (
                        <p className="text-danger text-xs font-medium">{t('lineOutOfStock')}</p>
                      ) : (
                        /*
                         * Stock is reserved at checkout now (lib/actions/checkout.ts),
                         * so a thin shelf is something the customer needs to know
                         * HERE — at the last step it stops being a warning and
                         * becomes a refusal.
                         */
                        line.stock <= LOW_STOCK && (
                          <p className="text-warning-fg text-xs font-medium">
                            {t('lineLowStock', { count: formatNumber(line.stock, locale) })}
                          </p>
                        )
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
                {/* The gross line is only worth printing when something comes
                    off it — see the discounted branch below. */}
                {group.total !== group.subtotal && (
                  <div className="text-muted-foreground flex justify-between">
                    <span>{t('shopSubtotal')}</span>
                    <span className="tabular-nums">{formatCurrency(group.subtotal, locale)}</span>
                  </div>
                )}

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

                {/*
                  ONE ROW WHEN NOTHING WAS DEDUCTED. «جمع این دکان» and «قابل
                  پرداخت این دکان» carried the SAME number three millimetres
                  apart on every undiscounted shop, which reads as a mistake and
                  makes the customer stop to work out which of the two they owe.
                  With an offer both rows earn their place, because the second
                  is genuinely a different figure.
                */}
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

            {/* Distance to free delivery, as a bar rather than a sentence —
                the same control the checkout screen shows (PRD §8.1). */}
            <FreeDeliveryBar
              percent={(cart.total / Math.max(1, settings.freeDeliveryThreshold)) * 100}
              reached={freeDeliveryGap <= 0}
              message={
                freeDeliveryGap > 0
                  ? t('freeDeliveryHint', {
                      amount: formatCurrency(freeDeliveryGap, locale),
                      fee: formatCurrency(settings.deliveryFee, locale),
                    })
                  : t('freeDeliveryReached')
              }
            />

            {/* Below `lg` this button lives in the sticky bar at the foot of
                the page instead, so the same call to action is never on screen
                twice. */}
            <Button asChild size="lg" className="w-full max-lg:hidden">
              <Link href="/checkout">{t('checkout')}</Link>
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link href="/products">{t('continueShopping')}</Link>
            </Button>
          </div>
        </aside>
      </div>

      {/*
        THE STICKY PRIMARY ACTION, on phones and tablets (finding #5).

        A basket spanning three shops puts «ادامه به پرداخت» roughly fifteen
        hundred pixels below the fold, and the summary card it lives in is the
        LAST block in the mobile flow — so the one thing this screen exists to
        do was reachable only by scrolling past everything else first. The bar
        carries the payable total with it, because a button to pay that does not
        say what it costs is the wrong half of the decision.

        `sticky`, not `fixed`, for the reason the product page's action bar
        gives: the storefront shell wraps its content in StretchScroll, whose
        transform during an overscroll becomes the containing block for any
        fixed descendant and throws it out of the viewport for the length of the
        gesture. `bottom-16` clears the mobile tab bar; from `md` there is no
        tab bar, and from `lg` the summary card is itself sticky and owns the
        button again.

        No transition here on purpose, so there is nothing for
        `prefers-reduced-motion` to gate — the bar is a position, not an
        animation, and the behaviour is therefore identical for every reader.
      */}
      <div className="border-border bg-background/95 sticky bottom-16 z-30 -mx-4 mt-6 flex items-center gap-3 border-t p-3 backdrop-blur-md md:bottom-0 lg:hidden">
        <div className="min-w-0">
          <p className="text-muted-foreground text-2xs">{t('total')}</p>
          <p className="text-base font-bold tabular-nums">
            {formatCurrency(cart.total, locale)}
          </p>
        </div>
        <Button asChild size="lg" className="ms-auto shrink-0">
          <Link href="/checkout">{t('checkout')}</Link>
        </Button>
      </div>
    </div>
  );
}
