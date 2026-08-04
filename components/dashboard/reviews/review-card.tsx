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
 * The three replies that cover almost every review (Prompt: starter replies).
 *
 * A BLANK DARI TEXTAREA BETWEEN TWO CUSTOMERS IS WHY REPLIES DO NOT HAPPEN.
 * The hard part of answering a review is not the opinion — the shopkeeper has
 * that already — it is composing a public sentence, in writing, in the thirty
 * seconds before the next person reaches the counter. The placeholder already
 * contained a usable sentence and could not be used; these are the same idea
 * made insertable.
 *
 * Three, not eight: thank, apologise-and-look-into-it, ask what went wrong.
 * Every review a shop gets is one of those three conversations, and a list long
 * enough to need reading is another thing to do rather than a way out of doing
 * it.
 *
 * They INSERT EDITABLE TEXT and send nothing. A one-tap public reply would be a
 * shop answering its customers with a form letter, which is worse than silence;
 * this is a first draft with the shopkeeper's name on it, and the cursor is
 * left in the box.
 */
const STARTERS = ['thanks', 'sorry', 'clarify'] as const;

/** The same window the action queue offers, for the same reason. */
const UNDO_MS = 5000;

/**
 * One review with the shop's reply (PRD §6.5).
 *
 * Responding is a dialog, not an inline textarea: a public reply to a one-star
 * review deserves a beat of deliberation.
 *
 * IT IS NO LONGER AN IRREVERSIBLE ACT AT THE MOMENT OF PRESSING (Prompt: soften
 * "it can only be written once"). The reply still cannot be edited once the
 * customer has it — that is a property of a public answer, not a UI choice —
 * but the send now goes through the same UNDO-BEFORE-COMMIT window the action
 * queue uses (components/dashboard/inline-order-action.tsx): the dialog closes,
 * the reply appears on the card, a toast offers to take it back for a few
 * seconds, and only then is the server told. Press undo and nothing ever
 * happened, because nothing had happened. A hesitant typist should not be
 * facing a wall.
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

  /** Sent, shown, and not yet committed — see the undo window above. */
  const [queued, setQueued] = React.useState<string | null>(null);
  const composer = React.useRef<HTMLTextAreaElement>(null);

  /*
   * The pending commit lives in a ref rather than in state: it is read by an
   * unmount cleanup that must see the LATEST value, and a stale closure over
   * state would post a reply the shopkeeper had already withdrawn.
   */
  const commitRef = React.useRef<{ timer: number; commit: () => void } | null>(null);

  const commit = React.useCallback(
    async (text: string) => {
      commitRef.current = null;
      const result = await respondToReview({ reviewId: review.id, body: text });
      if (!result.ok) {
        // A prediction that turned out wrong has to be visibly retracted, not
        // left standing on the card.
        setQueued(null);
        setBody(text);
        setReplying(true);
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('responded'));
      router.refresh();
    },
    [review.id, router, t],
  );

  /*
   * LEAVING THE PAGE COMMITS rather than dropping the reply. A shopkeeper who
   * sends an answer and immediately taps the next review expects it to have
   * been sent; discarding it because a timer had not finished would be the
   * worst possible reading of "undo".
   */
  React.useEffect(() => {
    return () => {
      const current = commitRef.current;
      if (!current) return;
      window.clearTimeout(current.timer);
      commitRef.current = null;
      current.commit();
    };
  }, []);

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
    const text = body.trim();
    if (text.length < 3) return;

    setReplying(false);
    setBody('');
    setQueued(text);

    const timer = window.setTimeout(() => void commit(text), UNDO_MS);
    commitRef.current = { timer, commit: () => void commit(text) };

    toast.success(t('replyQueued'), {
      duration: UNDO_MS,
      action: {
        label: t('replyUndo'),
        onClick: () => {
          const current = commitRef.current;
          if (!current) return;
          window.clearTimeout(current.timer);
          commitRef.current = null;
          // Back into the composer with the words still in it: the intent is
          // almost always to change a sentence, not to abandon the reply.
          setQueued(null);
          setBody(text);
          setReplying(true);
        },
      },
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

      {/* The shop's answer, rendered exactly as customers see it. The queued
          reply uses the same block, so the undo window looks like what it will
          become rather than like a separate "pending" state. */}
      {(queued ?? review.responseBody) ? (
        <div className="rounded-control border-primary-200 bg-primary-50 border-s-2 p-3">
          <p className="text-primary text-xs font-bold">{t('yourReply')}</p>
          <p className="mt-1 text-sm" dir="auto">
            {queued ?? review.responseBody}
          </p>
          {queued && <p className="text-muted-foreground mt-1 text-xs">{t('replyQueued')}</p>}
          {!queued && review.responseAt && (
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
            {/* Public — say so before they write, not after. */}
            <DialogDescription>{t('replyBody')}</DialogDescription>
          </DialogHeader>

          {/* And the softening: it is public, but it is not yet sent. */}
          <p className="text-muted-foreground -mt-2 text-xs">{t('replyUndoable')}</p>

          {/* Starter replies — see the note at the top of this file. */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-neutral-600">{t('starters.heading')}</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => {
                    setBody(t(`starters.${starter}` as never));
                    // Focus lands in the box so the next thing that happens is
                    // editing, not hunting for where the text went.
                    composer.current?.focus();
                  }}
                  className="rounded-pill border-border bg-card hover:border-primary border px-3 py-1.5 text-xs font-medium transition-colors duration-150"
                >
                  {t(`starterLabels.${starter}` as never)}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            ref={composer}
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
