import { getLocale, getTranslations } from 'next-intl/server';
import { BadgeCheck, Store } from 'lucide-react';

import { RatingStars } from '@/components/custom/rating-stars';
import { pickLocale } from '@/lib/db/localized';
import { productReviews } from '@/lib/db/queries/reviews';
import { formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Public review list (PRD §5.2, §5.5).
 *
 * Every review here is verified by construction — the schema requires a
 * fulfilled order_item — so the tick is a statement of fact, not a claim.
 * A shopkeeper's reply is nested under the review it answers, once (PRD §5.5).
 */
export async function ReviewList({
  productId,
  slug,
  page,
}: {
  productId: string;
  slug: string;
  page: number;
}) {
  const locale = await getLocale();
  const t = await getTranslations('product');
  const result = await productReviews(productId, page);

  if (result.items.length === 0) return null;

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {result.items.map((review) => (
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
          </li>
        ))}
      </ul>

      {result.pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/products/${slug}?reviewPage=${page - 1}`}
              className="rounded-control border-border border px-3 py-1.5 hover:bg-neutral-100"
              scroll={false}
            >
              {t('previousReviews')}
            </Link>
          )}
          {page < result.pageCount && (
            <Link
              href={`/products/${slug}?reviewPage=${page + 1}`}
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
