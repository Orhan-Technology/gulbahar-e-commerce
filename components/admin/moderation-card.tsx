'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { RatingStars } from '@/components/custom/rating-stars';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { moderateReview } from '@/lib/actions/admin-catalogue';
import { formatDate, formatNumber, formatPhone, formatRating } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { hasRatingEvidence } from '@/lib/ratings';
import { cn } from '@/lib/utils';

export type ModerationRow = {
  id: string;
  rating: number;
  body: string | null;
  status: 'visible' | 'reported' | 'removed';
  createdAt: string;
  authorName: string;
  authorPhone: string;
  productSlug: string;
  productTitle: string;
  shopName: string;
  shopSlug: string;
  responseBody: string | null;
  /**
   * The category the shop picked when it reported — as an ENUM CODE, when the
   * report carried one.
   *
   * `flagReview()` and the seed now record both shapes in the notification
   * payload: `reasonCode` (the enum) and `reason` (the sentence the shopkeeper
   * saw). Reports written before that change have only the second, so both
   * fields travel and the card picks.
   */
  reportReasonCode: string | null;
  /**
   * The RENDERED label the reporter chose, and its free-text note.
   *
   * Null when the report cannot be tied to THIS review with certainty — the
   * schema records neither reporter nor reason on `reviews`, and the only trace
   * is the notification `flagReview()` sends. See lib/db/queries/admin.ts for
   * the exact rule. Blank beats a guess on a decision that removes somebody's
   * words.
   */
  reportReason: string | null;
  reportNote: string | null;
  reportedAt: string | null;
  /** The author's standing: reviews of theirs still up, and ones already taken down. */
  authorVisibleReviews: number;
  authorRemovedReviews: number;
  /**
   * The SHOP's own average and how many reviews it rests on (Prompt C12).
   *
   * «این ۱ ستاره روی دکانی با میانگین ۴٫۶» is the one phrase that separates a
   * grudge from a signal — and without it the card asked an admin to judge a
   * score against nothing. Null when the shop has no visible reviews at all.
   */
  shopAverageRating: number | null;
  shopReviewCount: number;
};

/**
 * One reported review, in context (PRD §7.2).
 *
 * "Remove or uphold" is not decidable from a body of text alone, so the card shows
 * the rating, the product, the shop, and the shop's reply if there is one — the
 * reply is often the reason a shop reported the review in the first place.
 *
 * IT NOW SHOWS WHY IT WAS REPORTED. The card used to present the review and two
 * buttons and nothing else, so the admin had to infer from the text whether the
 * shop meant "this is abusive" or "this person never bought from us" — two
 * complaints with opposite correct answers. The reporter is always the shop
 * named on the row: a customer cannot report a review, only a shop can.
 *
 * And when the reason cannot be recovered, the AUTHOR'S RECORD is shown
 * instead, so the decision is never made on the text alone: one removal among
 * forty reviews is a bad night, three among four is a pattern.
 *
 * Both outcomes are recorded as a status change; neither rewrites the review. Admin
 * decides visibility, never wording.
 */
export function ModerationCard({ review }: { review: ModerationRow }) {
  const t = useTranslations('adminReviews');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  /*
   * WHY THE REASON IS RESOLVED IN TWO STEPS.
   *
   * This line used to be `t('reportReasons.' + review.reportReason)`, which
   * assumed the payload held an enum code. It held the RENDERED Dari label —
   * from both the live action and the seed — so next-intl looked up a key that
   * did not exist and did what it does with a miss: printed the path. The
   * moderation queue, the one screen in the console whose whole argument is
   * that a decision is made in context, carried the literal string
   * «گزارش‌شده به دلیل: adminReviews.reportReasons.این شخص از ما خرید نکرده».
   *
   * Both shapes are now accepted, and the fallback is a LITERAL, never a key
   * path: a code is translated, and anything else is shown exactly as the
   * shopkeeper wrote it. `has()` rather than a try/catch, so an unknown code
   * from a future enum value degrades to the stored sentence instead of
   * reintroducing the same bug in a new place.
   */
  const reasonLabel = review.reportReasonCode
    ? t.has(`reportReasons.${review.reportReasonCode}` as never)
      ? t(`reportReasons.${review.reportReasonCode}` as never)
      : (review.reportReason ?? review.reportReasonCode)
    : review.reportReason;

  function decide(decision: 'remove' | 'uphold') {
    startTransition(async () => {
      const result = await moderateReview({ reviewId: review.id, decision });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(decision === 'remove' ? 'removed' : 'upheld'));
      router.refresh();
    });
  }

  /*
   * THE CONTEXT SENTENCE, and when it is worth printing.
   *
   * Below `MIN_RATING_REVIEWS` a shop average is an anecdote dressed as a
   * benchmark — the same threshold the storefront uses before it will draw
   * stars at all (lib/ratings.ts) — so the card says nothing rather than
   * inviting a decision to be made against a sample of two.
   *
   * `outlier` is the reading that matters: a low score on a well-reviewed shop
   * is the review to read closely, and the phrase is toned to say so.
   */
  const hasShopAverage =
    review.shopAverageRating !== null && hasRatingEvidence(review.shopReviewCount);
  const outlier =
    hasShopAverage && (review.shopAverageRating as number) - review.rating >= 1.5;

  return (
    <li className="rounded-card border-border bg-card space-y-3 border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <RatingStars value={review.rating} size="sm" />
            {hasShopAverage && (
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 text-2xs',
                  outlier ? 'bg-warning-bg text-warning-fg font-semibold' : 'bg-neutral-100 text-neutral-600',
                )}
                data-shop-average
              >
                {t('againstShopAverage', {
                  rating: formatRating(review.rating, locale),
                  average: formatRating(review.shopAverageRating as number, locale),
                  n: review.shopReviewCount,
                  count: formatNumber(review.shopReviewCount, locale),
                })}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {review.authorName} · <span dir="ltr">{formatPhone(review.authorPhone, locale)}</span> ·{' '}
            {formatDate(review.createdAt, locale)}
          </p>
          <p className="text-xs">
            <Link
              href={`/products/${review.productSlug}`}
              target="_blank"
              className="hover:text-primary font-medium"
            >
              {review.productTitle}
            </Link>
            <span className="text-muted-foreground"> · </span>
            <Link
              href={`/shops/${review.shopSlug}`}
              target="_blank"
              className="text-muted-foreground hover:text-primary"
            >
              {review.shopName}
            </Link>
          </p>
        </div>

        <Badge
          variant={
            review.status === 'reported'
              ? 'warning'
              : review.status === 'removed'
                ? 'destructive'
                : 'success'
          }
        >
          {t(`status.${review.status}`)}
        </Badge>
      </div>

      {/*
        The complaint, above the text it is about. Reading the review first and
        the charge afterwards is how an admin ends up deciding whether they
        personally like the review.
      */}
      {reasonLabel && (
        <div className="rounded-control border-warning-border bg-warning-bg border-s-2 p-3">
          <p className="text-warning-fg text-xs font-bold">
            {t('reportedFor', { reason: reasonLabel })}
          </p>
          <p className="text-warning-fg/80 mt-1 text-xs">
            {t('reportedBy', {
              shop: review.shopName,
              date: review.reportedAt ? formatDate(review.reportedAt, locale) : '—',
            })}
          </p>
          {review.reportNote && <p className="mt-1 text-sm">«{review.reportNote}»</p>}
        </div>
      )}

      {review.body && <p className="text-sm leading-relaxed">{review.body}</p>}

      {/*
        The author's record. Always present, and the ONLY context there is when
        the report reason could not be recovered — which is the honest fallback
        rather than a blank card with two buttons on it.
      */}
      <p className="text-muted-foreground text-xs">
        {t('authorRecord', {
          visible: formatNumber(review.authorVisibleReviews, locale),
          removed: formatNumber(review.authorRemovedReviews, locale),
        })}
        {review.status === 'reported' && !reasonLabel && (
          <span className="text-muted-foreground"> · {t('noReasonRecorded')}</span>
        )}
      </p>

      {/* The shop's reply — frequently the context that decides the call. */}
      {review.responseBody && (
        <div className="rounded-control border-primary-200 bg-primary-50 border-s-2 p-3">
          <p className="text-primary text-xs font-bold">{t('shopReply')}</p>
          <p className="mt-1 text-sm">{review.responseBody}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {review.status !== 'removed' && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => decide('remove')}
            className="text-danger hover:bg-danger-bg"
          >
            <Trash2 />
            {t('remove')}
          </Button>
        )}
        {review.status !== 'visible' && (
          <Button size="sm" disabled={pending} onClick={() => decide('uphold')}>
            <ShieldCheck />
            {t('uphold')}
          </Button>
        )}
      </div>
    </li>
  );
}
