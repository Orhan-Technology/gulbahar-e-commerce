import { asc, eq, sql } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart, Package, ShieldCheck, Store } from 'lucide-react';

import { AddressManager } from '@/components/shop/account/address-manager';
import { ProfileForm } from '@/components/shop/account/profile-form';
import { SecurityForm } from '@/components/shop/account/security-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { addresses, users } from '@/lib/db/schema';
import { customerStats } from '@/lib/db/queries/orders';
import { KABUL_DISTRICTS } from '@/lib/districts';
import { formatMonthYear, formatNumber, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/** Account home (PRD §5.4): profile, saved addresses, and links onward. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);

  const [[profile], saved] = await Promise.all([
    db
      .select({
        name: users.name,
        phone: users.phone,
        locale: users.locale,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        // The hash itself never leaves the server — only whether one exists.
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
        passwordUpdatedAt: users.passwordUpdatedAt,
      })
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

  const stats = await customerStats(session.id);
  const displayName = profile?.name?.trim() || t('title');

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 sm:py-6">
      {/*
        A profile HEADER, not a page title.
        
        The account area was a heading over a stack of forms — correct, and
        indistinguishable from a settings screen. The monogram, the name and the
        three counts are what make it feel owned: they are the customer's own
        history, which is the one thing on this surface that is about them
        rather than about the shop.
      */}
      <header className="rounded-card border-border bg-card shadow-card flex flex-wrap items-center gap-4 border p-5">
        <span
          className="rounded-pill bg-primary-50 text-primary flex h-16 w-16 shrink-0 items-center justify-center text-2xl font-bold"
          aria-hidden
        >
          {displayName.charAt(0)}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{displayName}</h1>
          {/* LTR on the phone number: it is a dialable string, not prose, and it
              reads backwards if it inherits the paragraph direction. */}
          {profile?.phone && (
            <p className="text-muted-foreground text-sm tabular-nums" dir="ltr">
              {formatPhone(profile.phone, locale)}
            </p>
          )}
          {stats.memberSince && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('memberSince', { date: formatMonthYear(stats.memberSince, locale) })}
            </p>
          )}
        </div>

        <dl className="flex w-full gap-2 sm:w-auto">
          {(
            [
              ['orders', stats.orders],
              ['wishlist', stats.wishlist],
              ['reviews', stats.reviews],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="rounded-control flex-1 bg-neutral-100 px-3 py-2 text-center">
              <dd className="text-base font-bold tabular-nums">{formatNumber(value, locale)}</dd>
              <dt className="text-2xs text-neutral-600">{t(`stat.${key}`)}</dt>
            </div>
          ))}
        </dl>
      </header>

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
          <CardTitle>{t('security.heading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityForm
            locale={locale}
            email={profile?.email ?? null}
            emailVerifiedAt={profile?.emailVerifiedAt ?? null}
            hasPassword={Boolean(profile?.hasPassword)}
            passwordUpdatedAt={profile?.passwordUpdatedAt ?? null}
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
