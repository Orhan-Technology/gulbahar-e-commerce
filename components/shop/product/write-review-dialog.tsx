'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PenLine } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RatingStarsInput } from '@/components/custom/rating-stars';
import { submitReview } from '@/lib/actions/reviews';

export type WriteReviewDialogProps = {
  productSlug: string;
  /** Present when the customer already reviewed this product — offers an edit. */
  existing?: { rating: number; body: string | null } | null;
};

/**
 * Write or edit a review (PRD §5.5).
 *
 * Only rendered when the server has confirmed this customer has a fulfilled
 * purchase of this product, so the dialog's presence is itself the signal that
 * the review will be accepted. The action re-checks regardless.
 */
export function WriteReviewDialog({ productSlug, existing }: WriteReviewDialogProps) {
  const t = useTranslations('product.reviewForm');
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(existing?.rating ?? 5);
  const [body, setBody] = React.useState(existing?.body ?? '');
  const [pending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await submitReview({ productSlug, rating, body: body.trim() || undefined });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      setOpen(false);
      toast.success(result.mode === 'updated' ? t('updated') : t('created'));
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={existing ? 'outline' : 'default'}>
          <PenLine />
          {existing ? t('editTitle') : t('writeTitle')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{existing ? t('editTitle') : t('writeTitle')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('ratingLabel')}</Label>
              <RatingStarsInput value={rating} onChange={setRating} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-body">{t('bodyLabel')}</Label>
              <Textarea
                id="review-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t('bodyPlaceholder')}
                rows={4}
                maxLength={1000}
              />
              <p className="text-muted-foreground text-xs">{t('bodyOptional')}</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('saving') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
