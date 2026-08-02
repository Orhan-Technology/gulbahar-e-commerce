import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AccountSectionHeader } from '@/components/shop/account/section-header';
import { FollowingPanel, FollowingPanelSkeleton } from '@/components/shop/account/following-panel';
import { requireUser } from '@/lib/auth/guards';

/**
 * The shops this customer follows, and what they have been doing (Prompt:
 * follow is a dead loop).
 *
 * ITS OWN ROUTE, not a band on the hub. The hub already carries a compact list
 * of followed shops; what it cannot carry is each shop's new products and live
 * offers without becoming a feed. Giving the relationship an address also gives
 * the follow button somewhere to point, which is what turns pressing it into a
 * decision with a consequence.
 *
 * The panel is behind a Suspense boundary because it is the only thing on the
 * page that waits — the header renders immediately, so the section has an
 * identity while its content loads rather than showing the previous page.
 */
export default async function AccountFollowingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);

  // Read once, on the server, and handed down — the vacation-mode badges and
  // the live-offer window must agree with each other (CLAUDE.md).
  const now = new Date();

  return (
    <div className="space-y-4">
      <AccountSectionHeader
        title={t('sections.following.title')}
        description={t('sections.following.body')}
      />

      <Suspense fallback={<FollowingPanelSkeleton />}>
        <FollowingPanel userId={session.id} now={now} />
      </Suspense>
    </div>
  );
}
