'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, MessageSquareReply, MoreHorizontal } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { flagReview, respondToReview } from '@/lib/actions/shop-reviews';
import { REVIEW_FLAG_REASONS, type ReviewFlagReason } from '@/lib/review-flags';
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

  /*
   * Reporting now needs a REASON (Prompt: flagReview carries none, so admin
   * moderates context-free). It became a dialog for that: a category is a
   * choice, and a choice made by a single button press is not a choice. The
   * dialog is also the place to say what reporting does and does not do — the
   * review stays visible either way, because a shop that could hide a rating by
   * reporting it makes every rating meaningless.
   */
  const [flagging, setFlagging] = React.useState(false);
  const [reason, setReason] = React.useState<ReviewFlagReason | ''>('');
  const [note, setNote] = React.useState('');

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
          {/* A customer's name and a product title are user-generated: a Dari
              name in the English UI (or the reverse) sets its own direction, or
              the «·» and the date jump to the wrong end of the line. */}
          <p className="text-muted-foreground mt-1 text-xs">
            <span dir="auto">{review.authorName}</span> ·{' '}
            {formatDate(review.createdAt, locale)}
          </p>
          <Link
            href={`/products/${review.productSlug}`}
            dir="auto"
            className="hover:text-primary clamp-1 block text-xs font-medium"
          >
            {review.productTitle}
          </Link>
        </div>

        {review.status === 'reported' && <Badge variant="warning">{t('flagged')}</Badge>}
      </div>

      {review.body && (
        <p className="text-sm" dir="auto">
          {review.body}
        </p>
      )}

      {/* The shop's answer, rendered exactly as customers see it. */}
      {review.responseBody ? (
        <div className="rounded-control border-primary-200 bg-primary-50 border-s-2 p-3">
          <p className="text-primary text-xs font-bold">{t('yourReply')}</p>
          <p className="mt-1 text-sm" dir="auto">
            {review.responseBody}
          </p>
          {review.responseAt && (
            <p className="text-muted-foreground mt-1 text-xs">
              {formatDate(review.responseAt, locale)}
            </p>
          )}
        </div>
      ) : (
        /*
         * REPLYING IS THE JOB (Prompt C14). It was an outline button sitting
         * beside a report button of the same size, so the screen offered
         * "answer your customer" and "complain to the mall about your customer"
         * as equal choices. Reporting is rare, it is not urgent, and it belongs
         * where rare things belong.
         */
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setReplying(true)}>
            <MessageSquareReply />
            {t('respond')}
          </Button>

          {review.status === 'visible' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ms-auto h-8 w-8 text-neutral-500"
                  aria-label={t('moreActions')}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setFlagging(true)}>
                  <Flag />
                  {t('flag')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <Dialog open={flagging} onOpenChange={setFlagging}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('flagTitle')}</DialogTitle>
            {/* Said before they choose: this does not remove the review. */}
            <DialogDescription>{t('flagBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`flag-reason-${review.id}`}>{t('flagReasonLabel')}</Label>
            <select
              id={`flag-reason-${review.id}`}
              className="rounded-control border-input bg-card h-10 w-full border px-3 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value as ReviewFlagReason)}
            >
              <option value="">{t('flagReasonPlaceholder')}</option>
              {REVIEW_FLAG_REASONS.map((key) => (
                <option key={key} value={key}>
                  {t(`flagReasons.${key}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`flag-note-${review.id}`}>{t('flagNoteLabel')}</Label>
            <Textarea
              id={`flag-note-${review.id}`}
              rows={3}
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('flagNotePlaceholder')}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFlagging(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason === ''}
              onClick={() =>
                startTransition(async () => {
                  if (reason === '') return;
                  const result = await flagReview({
                    reviewId: review.id,
                    reason,
                    note: note.trim() || null,
                  });
                  if (!result.ok) {
                    toast.error(t(`errors.${result.error}` as never));
                    return;
                  }
                  setFlagging(false);
                  toast.success(t('flaggedDone'));
                  router.refresh();
                })
              }
            >
              <Flag />
              {pending ? t('sending') : t('flagSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
