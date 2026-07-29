import { asc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart, Package, ShieldCheck, Store } from 'lucide-react';

import { AddressManager } from '@/components/shop/account/address-manager';
import { ProfileForm } from '@/components/shop/account/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { addresses, users } from '@/lib/db/schema';
import { KABUL_DISTRICTS } from '@/lib/districts';
import { Link } from '@/lib/i18n/navigation';

/** Account home (PRD §5.4): profile, saved addresses, and links onward. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);

  const [[profile], saved] = await Promise.all([
    db
      .select({ name: users.name, phone: users.phone, locale: users.locale })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1),
    db
      .select({
        id: addresses.id,
        label: addresses.label,
        district: addresses.district,
        streetDetails: addresses.streetDetails,
        phone: addresses.phone,
      })
      .from(addresses)
      .where(eq(addresses.userId, session.id))
      .orderBy(asc(addresses.createdAt)),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      {/* Role-aware workspace shortcut (QA fix): a shopkeeper or admin landing on
          the customer account page gets a clearly-marked door to their own
          surface, instead of having to know the URL. */}
      {session.role === 'shopkeeper' && (
        <Link
          href="/dashboard"
          className="rounded-card border-primary-200 bg-primary-50 shadow-card hover:shadow-overlay flex items-center gap-3 border p-4 transition-shadow duration-150"
        >
          <span className="rounded-control bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center">
            <Store className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-primary-800 text-sm font-bold">{t('myShopTitle')}</span>
            <span className="text-primary-700 text-xs">{t('myShopHint')}</span>
          </span>
        </Link>
      )}
      {session.role === 'admin' && (
        <Link
          href="/admin"
          className="rounded-card border-primary-200 bg-primary-50 shadow-card hover:shadow-overlay flex items-center gap-3 border p-4 transition-shadow duration-150"
        >
          <span className="rounded-control bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-primary-800 text-sm font-bold">{t('adminTitle')}</span>
            <span className="text-primary-700 text-xs">{t('adminHint')}</span>
          </span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/account/orders"
          className="rounded-card border-border bg-card shadow-card hover:shadow-overlay flex items-center gap-3 border p-4 transition-shadow duration-150"
        >
          <span className="rounded-control bg-primary-50 text-primary-700 flex h-10 w-10 items-center justify-center">
            <Package className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold">{t('myOrders')}</span>
        </Link>

        <Link
          href="/account/wishlist"
          className="rounded-card border-border bg-card shadow-card hover:shadow-overlay flex items-center gap-3 border p-4 transition-shadow duration-150"
        >
          <span className="rounded-control bg-danger-bg text-danger flex h-10 w-10 items-center justify-center">
            <Heart className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold">{t('myWishlist')}</span>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profileHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={profile?.name ?? ''}
            locale={profile?.locale ?? locale}
            phone={profile?.phone ?? ''}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('addressesHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddressManager addresses={saved} districts={KABUL_DISTRICTS} />
        </CardContent>
      </Card>
    </div>
  );
}
