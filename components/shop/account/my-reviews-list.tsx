'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { RatingStars, RatingStarsInput } from '@/components/custom/rating-stars';
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
import { deleteMyReview, submitReview } from '@/lib/actions/reviews';
import { formatDate } from '@/lib/format';
import { Link, useRouter } from '@/lib/i18n/navigation';

export type MyReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  /** ISO string — the clock read belongs on the server (CLAUDE.md). */
  createdAt: string;
  productSlug: string;
  productTitle: string;
  productImage: string | null;
  shopName: string;
  responseBody: string | null;
  responseCreatedAt: string | null;
};

/**
 * The reviews this customer has written (Prompt A2).
 *
 * The data was always there — the product page has shown it to everyone else
 * since S5 — but the author had no way back to their own words except by
 * remembering which product they were about. Editing reuses `submitReview`,
 * which already treats a second submission for the same product as an update,
 * so there is one code path for writing a review and no second set of rules
 * that could disagree with it.
 *
 * The SHOP'S REPLY travels with each row. It is the half of the conversation
 * the author never sees unless they revisit the product page, and a reply
 * nobody reads is the same as no reply.
 */
export function MyReviewsList({ reviews }: { reviews: MyReviewRow[] }) {
  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id}>
          <ReviewRow review={review} />
        </li>
      ))}
    </ul>
  );
}

function ReviewRow({ review }: { review: MyReviewRow }) {
  const t = useTranslations('account');
  const locale = useLocale();
  const router = useRouter();

  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [rating, setRating] = React.useState(review.rating);
  const [pending, startTransition] = React.useTransition();

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get('body') ?? '');

    startTransition(async () => {
      const result = await submitReview({
        productSlug: review.productSlug,
        rating,
        body: body.trim() || undefined,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('reviews.saved'));
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteMyReview(review.id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('reviews.deleted'));
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <article className="rounded-card border-border bg-card border p-4">
      <div className="flex items-start gap-3">
        {/* The product is the subject. A rating with no subject is a number. */}
        <Link
          href={`/products/${review.productSlug}`}
          className="rounded-control relative h-14 w-14 shrink-0 overflow-hidden bg-neutral-100"
        >
          {review.productImage && (
            <Image
              src={review.productImage}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
            />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/products/${review.productSlug}`}
            className="hover:text-primary block truncate text-sm font-semibold"
          >
            {review.productTitle}
          </Link>
          <p className="text-muted-foreground truncate text-xs">{review.shopName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RatingStars value={editing ? rating : review.rating} size="sm" />
            <span className="text-muted-foreground text-xs">
              {formatDate(review.createdAt, locale, 'short')}
            </span>
          </div>
        </div>

        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              aria-label={t('reviews.edit')}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirming(true)}
              aria-label={t('reviews.delete')}
              className="hover:text-danger text-neutral-500"
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <form onSubmit={onSave} className="mt-3 space-y-3">
          <RatingStarsInput value={rating} onChange={setRating} size="md" />
          <Textarea
            name="body"
            defaultValue={review.body ?? ''}
            rows={4}
            maxLength={1000}
            placeholder={t('reviews.bodyPlaceholder')}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t('saving') : t('save')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRating(review.rating);
                setEditing(false);
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        review.body && <p className="mt-3 text-sm leading-relaxed">{review.body}</p>
      )}

      {review.responseBody && (
        <div className="rounded-control mt-3 bg-neutral-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            {t('reviews.shopReplied', { shop: review.shopName })}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600">{review.responseBody}</p>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reviews.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('reviews.deleteBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? t('saving') : t('reviews.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
