import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Package, Store } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { CartGroup } from '@/lib/cart';
import { pickLocale } from '@/lib/db/localized';
import { formatCurrency, formatNumber } from '@/lib/format';

/**
 * What is actually in the basket, ON the checkout screen (PRD §5.3).
 *
 * Checkout used to show a total and nothing else: the customer confirmed a
 * number and had to trust it, and the only way to check what they were buying
 * was to go back — which on a payment screen is the moment baskets get
 * abandoned. This is the same basket the cart shows, condensed to what confirms
 * it is the right one: the photograph, the name, the variant, how many, and
 * what that line costs.
 *
 * GROUPED BY SHOP, like the cart, because that grouping is not decoration here.
 * A Gulbahar order routinely spans tenants and each of them fulfils separately,
 * so the groups ARE the parcels — which is why the count is stated up front
 * rather than discovered on the confirmation screen.
 */
export async function CheckoutItems({
  groups,
  locale,
}: {
  groups: CartGroup[];
  locale: string;
}) {
  const t = await getTranslations('checkout');
  const itemCount = groups.reduce(
    (sum, group) => sum + group.lines.reduce((lines, line) => lines + line.quantity, 0),
    0,
  );

  return (
    <section className="rounded-card border-border bg-card overflow-hidden border">
      <header className="border-border flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-neutral-50 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <Package className="text-primary-700 h-4 w-4 shrink-0" aria-hidden />
          {t('itemsHeading')}
        </h2>
        <span className="text-muted-foreground text-xs">
          {t('itemCount', { count: formatNumber(itemCount, locale) })}
        </span>

        {/*
          THE EXPECTATION, SET BEFORE THE ORDER EXISTS. Two shops means two
          parcels arriving at two different times, and a customer who learns
          that after paying reads the second delivery as a missing first one.
        */}
        {groups.length > 1 && (
          <Badge variant="outline" className="ms-auto">
            {t('parts', { count: formatNumber(groups.length, locale) })}
          </Badge>
        )}
      </header>

      <ul className="divide-border divide-y">
        {groups.map((group) => (
          <li key={group.shopId} className="px-4 py-3">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{pickLocale(group.shopName, locale)}</span>
              <span className="ms-auto shrink-0 tabular-nums">
                {formatCurrency(group.total, locale)}
              </span>
            </p>

            <ul className="mt-2 space-y-2">
              {group.lines.map((line) => (
                <li key={line.productId} className="flex items-center gap-2.5">
                  <span className="rounded-control relative h-10 w-10 shrink-0 overflow-hidden bg-neutral-100">
                    {line.imagePath && (
                      <Image
                        src={line.imagePath}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="clamp-1 block text-sm">{pickLocale(line.title, locale)}</span>
                    {/*
                      CHIPS PLUS A COUNT, not one string joined by « · ». The
                      middle dot ran straight into the Persian numeral that
                      followed it and read as a leading zero, so «۲ عدد» after a
                      separator looked like «۰۲ عدد» — on the screen whose whole
                      job is confirming the basket is right.
                    */}
                    <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                      {line.variantSelection?.map((value) => (
                        <span
                          key={value}
                          className="rounded-pill text-2xs bg-neutral-100 px-1.5 py-0.5 text-neutral-600"
                        >
                          {value}
                        </span>
                      ))}
                      <span>{t('lineQuantity', { count: formatNumber(line.quantity, locale) })}</span>
                    </span>
                  </span>

                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatCurrency(line.lineTotal, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * NAMED export, not a static on the component (CLAUDE.md): a static attached to
 * a component that crosses the RSC boundary reads as undefined at runtime.
 */
export function CheckoutItemsSkeleton() {
  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex items-center gap-2.5">
          <Skeleton className="rounded-control h-10 w-10" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </section>
  );
}
