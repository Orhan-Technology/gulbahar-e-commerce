import { getLocale, getTranslations } from 'next-intl/server';
import { MessageSquareQuote, X } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingHistogram } from '@/components/shop/reviews/rating-histogram';
import { ReviewList } from '@/components/shop/reviews/review-list';
import { ReviewSortSelect } from '@/components/shop/reviews/review-sort-select';
import { WriteReviewDialog } from '@/components/shop/product/write-review-dialog';
import { currentUser } from '@/lib/auth/guards';
import { productRatingSummary } from '@/lib/db/queries/products';
import {
  productReviews,
  reviewableOrderItem,
  userReviewForProduct,
} from '@/lib/db/queries/reviews';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import {
  parseReviewPage,
  parseReviewSort,
  parseReviewStars,
  reviewHref,
  REVIEW_SORT_PARAM,
  REVIEW_STARS_PARAM,
} from '@/lib/review-sort';

/** Only the keys this panel reads; the page's own params are a superset. */
export type ReviewSearchParams = {
  reviewPage?: string | string[];
  reviewStars?: string | string[];
  reviewSort?: string | string[];
};

/**
 * The whole reviews block on a product page (Prompt: review depth).
 *
 * SELF-CONTAINED ON PURPOSE. It takes the page's `searchParams` PROMISE and its
 * own two ids, and does everything else itself — the summary, the entitlement
 * check, the filter, the order and the list. The product page previously spread
 * this across four components and three of its own queries, which meant the
 * reviews could not gain a URL-driven filter without the page growing a
 * vocabulary of review parameters it has no other use for.
 *
 * Awaiting a promise the page has already awaited is free — a promise resolves
 * once — so the mount costs one prop and no plumbing.
 *
 * REVIEWS ARE THE SCARCEST ASSET this marketplace has. Fourteen shops with five
 * products each cannot compete on selection, so what a buyer is actually
 * weighing on this screen is whether a real person in Kabul bought this and what
 * happened next. That is why the block is deep: a filter by star rating, an
 * order, and a helpfulness signal that promotes the reviews other buyers found
 * worth reading.
 */
export async function ProductReviewPanel({
  productId,
  productSlug,
  searchParams,
}: {
  productId: string;
  productSlug: string;
  searchParams: Promise<ReviewSearchParams>;
}) {
  const locale = await getLocale();
  const t = await getTranslations('product');
  const tFilter = await getTranslations('product.reviewFilter');

  const query = await searchParams;
  const stars = parseReviewStars(query.reviewStars);
  const sort = parseReviewSort(query.reviewSort);
  const page = parseReviewPage(query.reviewPage);

  const user = await currentUser();
  const [summary, result, entitlement, ownReview] = await Promise.all([
    productRatingSummary(productId),
    productReviews(productId, page, { stars, sort, viewerId: user?.id ?? null }),
    reviewableOrderItem(user?.id, productId),
    user?.id ? userReviewForProduct(user.id, productId) : Promise.resolve(null),
  ]);

  // What the sort control must carry across; the star filter is the only other
  // parameter this section owns, and dropping it on re-sort would silently widen
  // the list the reader is looking at.
  const preserved: Record<string, string> = {};
  if (stars) preserved[REVIEW_STARS_PARAM] = String(stars);
  if (sort) preserved[REVIEW_SORT_PARAM] = sort;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">{t('reviewsHeading')}</h2>
        {/*
          The form appears ONLY for a signed-in customer with a fulfilled order
          item for this product, or one editing their own review (PRD §5.5).
        */}
        {(entitlement || ownReview) && (
          <WriteReviewDialog
            productSlug={productSlug}
            existing={ownReview ? { rating: ownReview.rating, body: ownReview.body } : null}
          />
        )}
      </div>

      <RatingHistogram
        average={summary.average}
        total={summary.total}
        distribution={summary.distribution}
        productSlug={productSlug}
        activeStar={stars}
        sort={sort}
      />

      {summary.total > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {/*
            THE FILTER SAYS ITS OWN NAME AND CARRIES ITS OWN EXIT. A histogram
            bar that quietly shortens the list below it leaves a reader
            wondering where the other reviews went; this chip is the sentence
            that answers it, and the × is the one click back.
          */}
          {stars ? (
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <span>
                {tFilter('showing', {
                  star: formatNumber(stars, locale),
                  count: formatNumber(result.total, locale),
                })}
              </span>
              <Link
                href={reviewHref(productSlug, { stars: null, sort })}
                scroll={false}
                className="rounded-pill border-border hover:border-primary hover:text-primary inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium"
              >
                <X className="h-3 w-3" aria-hidden />
                {tFilter('clear')}
              </Link>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t('reviewCount', { count: formatNumber(result.total, locale) })}
            </p>
          )}

          <div className="ms-auto">
            <ReviewSortSelect current={sort} preserved={preserved} />
          </div>
        </div>
      )}

      {result.items.length === 0 ? (
        summary.total === 0 ? null : (
          /* Filtered to nothing — reachable by a hand-typed URL, since a bar
             with no reviews behind it is not a link. */
          <EmptyState
            illustration={<MessageSquareQuote className="h-7 w-7" aria-hidden />}
            title={tFilter('emptyTitle', { star: formatNumber(stars ?? 0, locale) })}
            description={tFilter('emptyBody')}
            action={{ label: tFilter('clear'), href: reviewHref(productSlug, { sort }) }}
          />
        )
      ) : (
        <ReviewList
          items={result.items}
          page={result.page}
          pageCount={result.pageCount}
          productSlug={productSlug}
          stars={stars}
          sort={sort}
          viewerId={user?.id ?? null}
        />
      )}
    </div>
  );
}

/**
 * NAMED export, never a static on the component: a static attached to a module
 * that crosses the RSC boundary reads as undefined at runtime (CLAUDE.md).
 */
export function ProductReviewsSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="rounded-card h-36 w-full" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-card border-border bg-card space-y-2 border p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
