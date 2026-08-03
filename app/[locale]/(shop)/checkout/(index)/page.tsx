import { asc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ShoppingCart } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SignInForm } from '@/components/auth/sign-in-form';
import { CheckoutForm } from '@/components/shop/checkout/checkout-form';
import { CheckoutItems } from '@/components/shop/checkout/checkout-items';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { currentUser } from '@/lib/auth/guards';
import { getCart } from '@/lib/cart';
import { db } from '@/lib/db';
import { pickLocale } from '@/lib/db/localized';
import { defaultAddressId } from '@/lib/db/queries/account';
import { siteSettings } from '@/lib/db/queries/settings';
import { addresses } from '@/lib/db/schema';
import { KABUL_DISTRICTS } from '@/lib/districts';

/**
 * Checkout (PRD §5.3, §5.7).
 *
 * A guest is not redirected away — the sign-in step renders INLINE here, so the
 * basket and the checkout context stay on screen while the OTP arrives in the
 * notification panel. That is the moment the demo script points at (PRD §9.2), and
 * bouncing to a separate page would break it.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('checkout');

  const [cart, settings] = await Promise.all([getCart(), siteSettings()]);

  if (cart.groups.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          illustration={<ShoppingCart className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('browseProducts'), href: '/products' }}
        />
      </div>
    );
  }

  const user = await currentUser();

  if (!user?.id) {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t('signInHeading')}</CardTitle>
            <CardDescription>{t('signInBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Returning here keeps the basket and the flow intact. */}
            <SignInForm redirectTo="/checkout" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [saved, preferredAddressId] = await Promise.all([
    db
      .select({
        id: addresses.id,
        label: addresses.label,
        district: addresses.district,
        streetDetails: addresses.streetDetails,
        phone: addresses.phone,
      })
      .from(addresses)
      .where(eq(addresses.userId, user.id))
      .orderBy(asc(addresses.createdAt)),
    defaultAddressId(user.id),
  ]);

  /*
   * WHICH ADDRESS IS ALREADY SELECTED when the screen opens.
   *
   * It used to be `addresses[0]` — the oldest row — chosen silently, which for
   * anyone who has moved is the address they no longer live at, preselected on
   * the one screen where getting it wrong sends a courier to the wrong door.
   * The one they last had an order delivered to is a far better guess, and the
   * radio it lands on is labelled so the guess is visible rather than implicit.
   *
   * Verified against the live list: an order may name an address the customer
   * has since deleted, and preselecting an id that is not on screen would leave
   * the form looking as though nothing were chosen.
   */
  const defaultId =
    preferredAddressId && saved.some((address) => address.id === preferredAddressId)
      ? preferredAddressId
      : null;

  const pickupShops = cart.groups.map((group) => ({
    shopId: group.shopId,
    name: pickLocale(group.shopName, locale),
    floor: group.shopFloor,
    unitNumber: group.shopUnitNumber,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <div className="mt-4">
        <CheckoutForm
          addresses={saved}
          defaultAddressId={defaultId}
          districts={KABUL_DISTRICTS}
          pickupShops={pickupShops}
          cartTotal={cart.total}
          deliveryFee={settings.deliveryFee}
          freeDeliveryThreshold={settings.freeDeliveryThreshold}
          holdHours={settings.pickupHoldHours}
          shopCount={cart.groups.length}
          /*
           * Rendered HERE, on the server, and handed down as a node: the basket
           * needs a database read and localized titles, neither of which belongs
           * in a client component. It sits directly above the totals, so the
           * last thing read before paying is what is being paid for.
           */
          itemsSummary={<CheckoutItems groups={cart.groups} locale={locale} />}
        />
      </div>
    </div>
  );
}
