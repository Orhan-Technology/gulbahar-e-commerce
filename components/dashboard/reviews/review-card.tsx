'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, MessageSquareReply } from 'lucide-react';
import { toast } from 'sonner';

import { RatingStars } from '@/components/custom/rating-stars';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { flagReview, respondToReview } from '@/lib/actions/shop-reviews';
import { formatDate } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

export type ShopReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  status: 'visible' | 'reported' | 'removed';
  createdAt: string;
  authorName: string;
  productSlug: string;
  productTitle: string;
  responseBody: string | null;
  responseAt: string | null;
};

/**
 * One review with the shop's reply (PRD §6.5).
 *
 * Responding is a dialog, not an inline textarea: a public reply to a one-star
 * review deserves a beat of deliberation, and the dialog says out loud that it
 * cannot be edited afterwards.
 */
export function ReviewCard({
  review,
  autoReply = false,
}: {
  review: ShopReviewRow;
  /**
   * Opens the composer on mount. Set by the page for the review named in
   * `?reply=`, so the dashboard's "needs a reply" queue row lands with the box
   * already open — the point of that row is that replying is one tap away, and
   * a deep link that merely scrolls you to the review is not that.
   */
  autoReply?: boolean;
}) {
  const t = useTranslations('shopReviews');
  const locale = useLocale();
  const router = useRouter();

  const [replying, setReplying] = React.useState(autoReply);
  const [body, setBody] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  function submit() {
    startTransition(async () => {
      const result = await respondToReview({ reviewId: review.id, body });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('responded'));
      setReplying(false);
      setBody('');
      router.refresh();
    });
  }

  return (
    <li className="rounded-card border-border bg-card space-y-3 border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <RatingStars value={review.rating} size="sm" />
          <p className="text-muted-foreground mt-1 text-xs">
            {review.authorName} · {formatDate(review.createdAt, locale)}
          </p>
          <Link
            href={`/products/${review.productSlug}`}
            className="hover:text-primary clamp-1 text-xs font-medium"
          >
            {review.productTitle}
          </Link>
        </div>

        {review.status === 'reported' && <Badge variant="warning">{t('flagged')}</Badge>}
      </div>

      {review.body && <p className="text-sm">{review.body}</p>}

      {/* The shop's answer, rendered exactly as customers see it. */}
      {review.responseBody ? (
        <div className="rounded-control border-primary-200 bg-primary-50 border-s-2 p-3">
          <p className="text-primary text-xs font-bold">{t('yourReply')}</p>
          <p className="mt-1 text-sm">{review.responseBody}</p>
          {review.responseAt && (
            <p className="text-muted-foreground mt-1 text-xs">
              {formatDate(review.responseAt, locale)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setReplying(true)}>
            <MessageSquareReply />
            {t('respond')}
          </Button>

          {review.status === 'visible' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              className="hover:text-danger text-neutral-600"
              onClick={() =>
                startTransition(async () => {
                  const result = await flagReview(review.id);
                  if (!result.ok) toast.error(t(`errors.${result.error}` as never));
                  else {
                    toast.success(t('flaggedDone'));
                    router.refresh();
                  }
                })
              }
            >
              <Flag />
              {t('flag')}
            </Button>
          )}
        </div>
      )}

      <Dialog open={replying} onOpenChange={setReplying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('replyTitle')}</DialogTitle>
            {/* Once, and public — say so before they write, not after. */}
            <DialogDescription>{t('replyBody')}</DialogDescription>
          </DialogHeader>

          <Textarea
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('replyPlaceholder')}
            aria-label={t('replyTitle')}
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplying(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={pending || body.trim().length < 3}>
              {pending ? t('sending') : t('sendReply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
