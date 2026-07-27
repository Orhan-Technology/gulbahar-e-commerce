import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Star } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { RatingStars } from '@/components/custom/rating-stars';
import { ReviewCard } from '@/components/dashboard/reviews/review-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopReviewCounts, shopReviews } from '@/lib/db/queries/shop-reviews';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = { rating?: string; unanswered?: string };

/** Reviews across the shop's products (PRD §6.5). */
export default async function ShopReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopReviews');

  const counts = await shopReviewCounts(user.shopId);

  const chips = [
    {
      key: 'all',
      href: '/dashboard/reviews',
      count: counts.all,
      active: !query.rating && !query.unanswered,
    },
    {
      key: 'unanswered',
      href: '/dashboard/reviews?unanswered=1',
      count: counts.unanswered,
      active: query.unanswered === '1',
    },
    ...([5, 4, 3, 2, 1] as const).map((rating) => ({
      key: `star${rating}`,
      href: `/dashboard/reviews?rating=${rating}`,
      count: counts[`r${rating}` as 'r5'],
      active: query.rating === String(rating),
    })),
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold">{t('title')}</h1>
        {counts.all > 0 && (
          <span className="flex items-center gap-2">
            <RatingStars value={counts.average} size="sm" />
            <span className="text-muted-foreground text-xs">
              {t('averageOf', { count: formatNumber(counts.all, locale) })}
            </span>
          </span>
        )}
      </div>

      <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
              chip.active
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t(`filters.${chip.key}`)}
            <Badge variant={chip.active ? 'default' : 'secondary'}>
              {formatNumber(chip.count, locale)}
            </Badge>
          </Link>
        ))}
      </div>

      <Suspense fallback={<ReviewListSkeleton />}>
        <ReviewList shopId={user.shopId} locale={locale} query={query} />
      </Suspense>
    </div>
  );
}

async function ReviewList({
  shopId,
  locale,
  query,
}: {
  shopId: string;
  locale: string;
  query: Query;
}) {
  const t = await getTranslations('shopReviews');

  const rating = query.rating ? Number(query.rating) : undefined;
  const rows = await shopReviews({
    shopId,
    rating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
    unanswered: query.unanswered === '1',
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<Star className="h-7 w-7" />}
        title={query.unanswered === '1' ? t('emptyAnsweredTitle') : t('emptyTitle')}
        description={query.unanswered === '1' ? t('emptyAnsweredBody') : t('emptyBody')}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <ReviewCard
          key={row.id}
          review={{
            id: row.id,
            rating: row.rating,
            body: row.body,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
            authorName: row.authorName,
            productSlug: row.productSlug,
            productTitle: pickLocale(row.productTitle, locale),
            responseBody: row.responseBody,
            responseAt: row.responseAt ? row.responseAt.toISOString() : null,
          }}
        />
      ))}
    </ul>
  );
}

function ReviewListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} className="rounded-card border-border bg-card space-y-2 border p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </li>
      ))}
    </ul>
  );
}
