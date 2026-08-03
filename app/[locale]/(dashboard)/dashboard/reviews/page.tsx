import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Star } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { RatingStars } from '@/components/custom/rating-stars';
import { ChipScroller } from '@/components/dashboard/chip-scroller';
import { ReviewCard } from '@/components/dashboard/reviews/review-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopReviewCounts, shopReviews } from '@/lib/db/queries/shop-reviews';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = { rating?: string; unanswered?: string; reply?: string; all?: string };

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

  /*
   * THE PAGE OPENS ON THE PROBLEM (Prompt C14).
   *
   * This shop had thirteen reviews and thirteen of them unanswered, and the
   * screen opened calm: a chip row where «همه» was selected, a list in date
   * order, and the one fact that mattered — nobody has replied to anything —
   * available only by reading the small number on the second chip. The default
   * view is now the unanswered ones whenever there are any.
   *
   * A REDIRECT would have been the obvious way to do it and is the wrong one:
   * `/dashboard/reviews` is a link in the navigation and in the queue, and a
   * 307 from it takes the page out of the dev action manifest that the check
   * scripts drive the reply action through. So the URL stays and «همه» gets an
   * explicit address instead — the state is stated by the active chip and by
   * the line under it, which is what makes the default honest rather than
   * hidden.
   */
  const defaultUnanswered =
    !query.rating && !query.unanswered && !query.all && counts.unanswered > 0;
  const unanswered = query.unanswered === '1' || defaultUnanswered;

  const chips = [
    {
      key: 'all',
      href: '/dashboard/reviews?all=1',
      count: counts.all,
      active: !query.rating && !unanswered,
    },
    {
      key: 'unanswered',
      href: '/dashboard/reviews?unanswered=1',
      count: counts.unanswered,
      active: unanswered,
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

      <ChipScroller className="flex gap-2 pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            data-chip-active={chip.active}
            aria-current={chip.active ? 'page' : undefined}
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
      </ChipScroller>

      {/* Says which list this is, and where the rest went. */}
      {defaultUnanswered && (
        <p className="rounded-card border-warning-border bg-warning-bg text-warning flex flex-wrap items-center gap-x-2 gap-y-1 border p-3 text-xs">
          <span>
            {t('defaultUnansweredNote', { count: formatNumber(counts.unanswered, locale) })}
          </span>
          <Link href="/dashboard/reviews?all=1" className="font-bold underline">
            {t('filters.all')}
          </Link>
        </p>
      )}

      <Suspense fallback={<ReviewListSkeleton />}>
        <ReviewList shopId={user.shopId} locale={locale} query={query} unanswered={unanswered} />
      </Suspense>
    </div>
  );
}

async function ReviewList({
  shopId,
  locale,
  query,
  unanswered,
}: {
  shopId: string;
  locale: string;
  query: Query;
  unanswered: boolean;
}) {
  const t = await getTranslations('shopReviews');

  const rating = query.rating ? Number(query.rating) : undefined;
  const rows = await shopReviews({
    shopId,
    rating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
    unanswered,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<Star className="h-7 w-7" />}
        title={unanswered ? t('emptyAnsweredTitle') : t('emptyTitle')}
        description={unanswered ? t('emptyAnsweredBody') : t('emptyBody')}
      />
    );
  }

  /*
   * ANGRY AND UNANSWERED FIRST, then unanswered, then the rest — date order
   * inside each band, which a stable sort preserves from the query.
   *
   * Strict date order is the right default for a log and the wrong one for a
   * work queue: a one-star review from Tuesday that nobody has replied to is
   * the most expensive thing on this screen, and it was fourth.
   */
  const ordered = [...rows].sort((a, b) => band(a) - band(b));

  return (
    <ul className="space-y-2">
      {ordered.map((row) => (
        <ReviewCard
          key={row.id}
          autoReply={row.id === query.reply}
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

/** 0 = unanswered and 1–2★, 1 = unanswered, 2 = everything else. */
function band(row: { rating: number; responseBody: string | null }) {
  if (row.responseBody) return 2;
  return row.rating <= 2 ? 0 : 1;
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
