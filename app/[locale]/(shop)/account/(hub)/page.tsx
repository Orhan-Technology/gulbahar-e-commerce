import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, ShieldCheck, Store } from 'lucide-react';

import { FollowedShops } from '@/components/shop/account/followed-shops';
import { PaymentMethodsCard } from '@/components/shop/account/payment-methods-card';
import { ProfilePanel } from '@/components/shop/account/profile-panel';
import { SignOutButton } from '@/components/shop/account/sign-out-button';
import { pressable } from '@/components/motion/pressable';
import { ACCOUNT_SECTIONS } from '@/lib/account-sections';
import { requireUser } from '@/lib/auth/guards';
import { accountAddresses, accountCounts, accountProfile } from '@/lib/db/queries/account';
import { formatMonthYear, formatNumber, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The account hub (Prompt A2) — a landing surface, not a settings screen.
 *
 * What used to live here was one column of three forms: profile, security,
 * addresses. Correct, and indistinguishable from a preferences dialog. The hub
 * answers a different question first — what is in this account — and only then
 * offers doors to the places where things get changed.
 *
 * On a phone THIS PAGE IS THE NAVIGATION. The desktop sidebar is hidden below
 * `lg` (see AccountNav), so the section rows here are the only way through, and
 * each one is a real route rather than an accordion — which is what makes a
 * section shareable, linkable from a notification, and reachable with the
 * browser's own back button.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);

  // All three reads are `cache()`d and already resolved by the hub layout, so
  // this costs nothing extra — see lib/db/queries/account.ts.
  const [profile, counts, saved] = await Promise.all([
    accountProfile(session.id),
    accountCounts(session.id),
    accountAddresses(session.id),
  ]);

  const displayName = profile?.name?.trim() || t('title');
  const first = saved[0];

  /*
   * A computed message key resolves to `never` in next-intl's typing, which is
   * why the codebase writes `t('x' as never)` — and that also collapses the
   * VALUES parameter to `undefined`. This is the same cast, kept in one place
   * rather than repeated at the call site with a second `as never` on the
   * interpolation object.
   */
  const tCount = t as unknown as (key: string, values: Record<string, string | number>) => string;

  const chips = [
    { key: 'orders', href: '/account/orders', value: counts.orders },
    { key: 'wishlist', href: '/account/wishlist', value: counts.wishlist },
    { key: 'reviews', href: '/account/reviews', value: counts.reviews },
  ] as const;

  return (
    <div className="space-y-6">
      {/*
        A profile HEADER, not a page title. The monogram, the name and the three
        counts are what make the surface feel owned: they are the customer's own
        history, which is the one thing here that is about them rather than
        about the shop.
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
          {profile?.createdAt && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('memberSince', { date: formatMonthYear(profile.createdAt, locale) })}
            </p>
          )}
        </div>

        {/* Each chip LINKS. A count that cannot be opened is a statistic; a count
            that opens the list behind it is navigation. */}
        <dl className="flex w-full gap-2 sm:w-auto">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              className={cn(
                pressable,
                'rounded-control flex-1 bg-neutral-100 px-3 py-2 text-center transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-200 sm:min-w-20',
              )}
            >
              <dd className="text-base font-bold tabular-nums">
                {formatNumber(chip.value, locale)}
              </dd>
              <dt className="text-2xs text-neutral-600">{t(`stat.${chip.key}`)}</dt>
            </Link>
          ))}
        </dl>
      </header>

      {/* Role-aware workspace shortcut: a shopkeeper or admin landing on the
          customer account page gets a clearly-marked door to their own surface,
          instead of having to know the URL. */}
      {session.role === 'shopkeeper' && (
        <WorkspaceCard
          href="/dashboard"
          icon={<Store className="h-5 w-5" aria-hidden />}
          title={t('myShopTitle')}
          hint={t('myShopHint')}
        />
      )}
      {session.role === 'admin' && (
        <WorkspaceCard
          href="/admin"
          icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
          title={t('adminTitle')}
          hint={t('adminHint')}
        />
      )}

      <section aria-labelledby="account-sections-heading" className="space-y-3">
        <h2 id="account-sections-heading" className="sr-only">
          {t('navLabel')}
        </h2>

        <ul className="grid gap-3 sm:grid-cols-2">
          {ACCOUNT_SECTIONS.map((section) => {
            const Icon = section.icon;
            const count = section.countKey ? counts[section.countKey] : undefined;

            return (
              <li key={section.key}>
                <Link
                  href={section.href}
                  className={cn(
                    pressable,
                    'rounded-card border-border bg-card shadow-card hover:shadow-overlay flex h-full items-center gap-3 border p-4 transition-[box-shadow,scale] duration-150 ease-out',
                  )}
                >
                  <span className="rounded-control bg-primary-50 text-primary-700 flex h-10 w-10 shrink-0 items-center justify-center">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {t(`sections.${section.key}.title` as never)}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {/* The count REPLACES the description once there is one to
                          show: "۱۱ سفارش" is a better answer to "what is in
                          here" than a sentence describing what orders are. */}
                      {count && count > 0
                        ? tCount(`sections.${section.key}.count`, {
                            // `n` pluralises, `count` renders with locale digits.
                            n: count,
                            count: formatNumber(count, locale),
                          })
                        : t(`sections.${section.key}.body` as never)}
                    </span>
                  </span>

                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-neutral-400 rtl:rotate-180"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* The shops this customer follows (Prompt C8) — absent, not empty, when
          there are none. */}
      <FollowedShops userId={session.id} />

      {/* Honest about what is not built (Prompt A3): saved instruments are not
          a feature, and the card says so rather than being quietly absent. */}
      <PaymentMethodsCard />

      {/*
        The profile panel is a third COLUMN from `xl` and a block in the flow
        below it — same component, same rows, so the facts cannot diverge
        between viewports. The layout renders the column; this renders the
        block, and each hides where the other applies.
      */}
      {profile && (
        <div className="xl:hidden">
          <ProfilePanel
            data={{
              name: profile.name,
              phone: profile.phone,
              locale,
              email: profile.email,
              emailVerifiedAt: profile.emailVerifiedAt,
              hasPassword: profile.hasPassword,
              passwordUpdatedAt: profile.passwordUpdatedAt,
              defaultAddress: first ? `${first.label} — ${first.district}` : null,
            }}
          />
        </div>
      )}

      <div className="flex justify-center pb-2">
        <SignOutButton />
      </div>
    </div>
  );
}

function WorkspaceCard({
  href,
  icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        pressable,
        'rounded-card border-primary-200 bg-primary-50 shadow-card hover:shadow-overlay flex items-center gap-3 border p-4 transition-[box-shadow,scale] duration-150 ease-out',
      )}
    >
      <span className="rounded-control bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-primary-800 text-sm font-bold">{title}</span>
        <span className="text-primary-700 text-xs">{hint}</span>
      </span>
      <ChevronRight className="text-primary-400 ms-auto h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
    </Link>
  );
}
