import { getLocale, getTranslations } from 'next-intl/server';
import { BadgeCheck, Store } from 'lucide-react';

import { RatingStars } from '@/components/custom/rating-stars';
import { HelpfulButton } from '@/components/shop/reviews/helpful-button';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { reviewHref, type ReviewSort } from '@/lib/review-sort';

export type ReviewListItem = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  customerName: string;
  customerId: string;
  responseBody: string | null;
  responseShopName: LocalizedText | null;
  helpfulCount: number;
  viewerVoted: boolean;
};

/**
 * The public review list (PRD §5.2, §5.5).
 *
 * Every review here is verified by construction — the schema requires a
 * fulfilled order_item — so the tick is a statement of fact, not a claim. A
 * shopkeeper's reply is nested under the review it answers, once (PRD §5.5).
 *
 * The rows are HANDED IN rather than fetched here, so the panel above can run
 * one query and use its count for both the pagination and the "showing N of M"
 * line. A list that fetched its own page would have to be told the filter twice
 * and could disagree with the chip describing it.
 *
 * Pagination links carry the filter and the order (see reviewHref) and land on
 * the `#reviews` anchor, so page two of the one-star reviews is a real address
 * rather than a state the reader cannot get back to.
 */
export async function ReviewList({
  items,
  page,
  pageCount,
  productSlug,
  stars,
  sort,
  viewerId,
}: {
  items: ReviewListItem[];
  page: number;
  pageCount: number;
  productSlug: string;
  stars: number | null;
  sort: ReviewSort;
  /** Marks the reader's own review, which they may not vote for. */
  viewerId: string | null;
}) {
  const locale = await getLocale();
  const t = await getTranslations('product');

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {items.map((review) => (
          <li key={review.id} className="rounded-card border-border bg-card border p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <RatingStars value={review.rating} size="sm" />
              <span className="text-foreground text-sm font-medium">{review.customerName}</span>
              <span className="text-success inline-flex items-center gap-1 text-xs">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                {t('verifiedPurchase')}
              </span>
              <time
                dateTime={review.createdAt.toISOString()}
                className="text-muted-foreground ms-auto text-xs"
              >
                {formatRelative(review.createdAt, locale)}
              </time>
            </div>

            {review.body && <p className="mt-2 text-sm leading-relaxed">{review.body}</p>}

            {review.responseBody && (
              <div className="rounded-control border-primary-300 bg-primary-50/60 mt-3 border-s-2 p-3">
                <p className="text-primary-800 flex items-center gap-1.5 text-xs font-semibold">
                  <Store className="h-3.5 w-3.5" aria-hidden />
                  {review.responseShopName
                    ? t('shopReplied', { shop: pickLocale(review.responseShopName, locale) })
                    : t('shopReply')}
                </p>
                <p className="text-primary-900/90 mt-1 text-sm">{review.responseBody}</p>
              </div>
            )}

            {/* BELOW the shop's reply, not above it: the question "was this
                helpful" is about the exchange as a whole. */}
            <div className="mt-3 flex items-center">
              <HelpfulButton
                reviewId={review.id}
                initialCount={review.helpfulCount}
                initialVoted={review.viewerVoted}
                ownReview={viewerId === review.customerId}
              />
            </div>
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={reviewHref(productSlug, { stars, sort, page: page - 1 })}
              className="rounded-control border-border border px-3 py-1.5 hover:bg-neutral-100"
              scroll={false}
            >
              {t('previousReviews')}
            </Link>
          )}
          {page < pageCount && (
            <Link
              href={reviewHref(productSlug, { stars, sort, page: page + 1 })}
              className="rounded-control border-border border px-3 py-1.5 hover:bg-neutral-100"
              scroll={false}
            >
              {t('moreReviews')}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
