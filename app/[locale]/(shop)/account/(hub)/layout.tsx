import { setRequestLocale } from 'next-intl/server';

import { AccountNav } from '@/components/shop/account/account-nav';
import { ProfilePanel } from '@/components/shop/account/profile-panel';
import { requireUser } from '@/lib/auth/guards';
import { accountAddresses, accountCounts, accountProfile } from '@/lib/db/queries/account';

/**
 * The account area shell (Prompt A2).
 *
 * WHY THIS IS A `(hub)` ROUTE GROUP and not simply `account/layout.tsx`: this
 * layout guards every route under it with `requireUser`, which redirects to
 * `/account/sign-in`. That page lives one level up, OUTSIDE this group, so it
 * never inherits the guard — put it inside and a signed-out visitor is
 * redirected from the sign-in page to the sign-in page forever. Exactly the
 * failure `/dashboard/register-shop` has in `(onboarding)` (CLAUDE.md). Route
 * groups do not appear in the URL, so every path here is unchanged.
 *
 * Three regions on desktop — nav, content, profile panel — collapsing to
 * content alone on mobile, where the hub page itself is the navigation. The
 * nav and panel are the parts that must NOT re-render per section, which is
 * the whole reason they are in a layout: moving between orders and addresses
 * should move one column, not repaint the screen.
 */
export default async function AccountHubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);

  const [profile, counts, saved] = await Promise.all([
    accountProfile(session.id),
    accountCounts(session.id),
    accountAddresses(session.id),
  ]);

  const first = saved[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[13rem_minmax(0,1fr)_17rem]">
        {/* Sticky under the site header, which is 4rem tall. */}
        <div className="lg:sticky lg:top-20">
          <AccountNav counts={counts} />
        </div>

        <div className="min-w-0">{children}</div>

        {/*
          The panel appears from `xl`, not `lg`. At 1024px a third column leaves
          the middle one too narrow for an order card or a four-across wishlist
          grid — the content is the reason for the page, so it keeps the width
          and the panel waits for a viewport that can afford it. Below `xl` the
          same facts are reachable through Security and Settings, which is where
          A2 puts them on mobile for the same reason.
        */}
        {profile && (
          <div className="mt-6 hidden xl:sticky xl:top-20 xl:mt-0 xl:block">
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
      </div>
    </div>
  );
}
