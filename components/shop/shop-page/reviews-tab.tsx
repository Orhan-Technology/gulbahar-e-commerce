import { getLocale, getTranslations } from 'next-intl/server';
import { MessageSquareQuote } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { RatingStars } from '@/components/custom/rating-stars';
import { RatingSummary } from '@/components/shop/product/rating-summary';
import { WriteShopReviewDialog } from '@/components/shop/shop-page/write-shop-review-dialog';
import { currentUser } from '@/lib/auth/guards';
import {
  reviewableOrderForShop,
  shopServiceRating,
  shopServiceReviews,
} from '@/lib/db/queries/shop-page';
import { formatDate } from '@/lib/format';

/**
 * Shop-level reviews (Prompt C8).
 *
 * ABOUT THE SERVICE, and the page says so out loud above the list. Product
 * reviews live on the product; what a shop is judged on is whether the phone
 * gets answered, whether the order was ready when they said, and whether it was
 * packed properly — things that are invisible on a product page and are exactly
 * what someone deciding whether to trust a stall in a mall wants to know.
 *
 * THE VERIFIED-PURCHASE RULE is the same one product reviews follow, tied to an
 * ORDER: you may review a shop for an order it fulfilled for you, once per
 * order. Hiding the button is a courtesy; `submitShopReview` re-checks and
 * picks the order server-side, so nothing here is load-bearing for the rule.
 */
export async function ReviewsTab({ shopId }: { shopId: string }) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.reviews');

  const user = await currentUser();
  const [summary, reviews, reviewable] = await Promise.all([
    shopServiceRating(shopId),
    shopServiceReviews(shopId),
    reviewableOrderForShop(user?.id, shopId),
  ]);

  const distribution = Object.fromEntries(
    summary.distribution.map((entry) => [entry.star, entry.total]),
  ) as Record<number, number>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-bold">{t('title')}</h2>
          <p className="text-muted-foreground max-w-prose text-sm">{t('subtitle')}</p>
        </div>

        {reviewable && (
          <WriteShopReviewDialog shopId={shopId} orderReference={reviewable.reference} />
        )}
      </div>

      <RatingSummary average={summary.average} total={summary.total} distribution={distribution} />

      {reviews.length === 0 ? (
        <EmptyState
          illustration={<MessageSquareQuote className="h-7 w-7" aria-hidden />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-card border-border bg-card border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{review.authorName}</span>
                  {/* Every row in this table is earned by a fulfilled order, so
                      the badge is a statement of fact rather than a claim. */}
                  <span className="rounded-pill bg-success-50 text-success-700 px-2 py-0.5 text-2xs font-medium">
                    {t('verifiedPurchase')}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {formatDate(review.createdAt, locale, 'medium')}
                </span>
              </div>

              <RatingStars value={review.rating} size="sm" className="mt-2" />

              {review.body && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">{review.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
