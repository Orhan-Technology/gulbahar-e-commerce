import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Star } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { MyReviewsList, type MyReviewRow } from '@/components/shop/account/my-reviews-list';
import { AccountSectionHeader } from '@/components/shop/account/section-header';
import { requireUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { myReviews } from '@/lib/db/queries/account';

/**
 * The reviews this customer has written (Prompt A2).
 *
 * A section built entirely from data we already had. Every review on the site
 * carries its author, and the product page has rendered them since S5 — the
 * only thing missing was the reverse lookup, which is the one direction the
 * person who wrote them cares about.
 */
export default async function AccountReviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);
  const rows = await myReviews(session.id);

  // Localised and serialised HERE: the list is a client component, and a Date
  // read during its render would break React 19's purity rule (CLAUDE.md).
  const reviews: MyReviewRow[] = rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    productSlug: row.productSlug,
    productTitle: pickLocale(row.productTitle, locale),
    productImage: row.productImage,
    shopName: pickLocale(row.shopName, locale),
    responseBody: row.responseBody,
    responseCreatedAt: row.responseCreatedAt ? row.responseCreatedAt.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <AccountSectionHeader
        title={t('sections.reviews.title')}
        description={t('sections.reviews.body')}
      />

      {reviews.length === 0 ? (
        <EmptyState
          illustration={<Star className="h-7 w-7" />}
          title={t('reviews.emptyTitle')}
          description={t('reviews.emptyBody')}
          action={{ label: t('reviews.emptyAction'), href: '/account/orders' }}
        />
      ) : (
        <MyReviewsList reviews={reviews} />
      )}
    </div>
  );
}
