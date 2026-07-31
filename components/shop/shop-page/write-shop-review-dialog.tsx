'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PenLine } from 'lucide-react';
import { toast } from 'sonner';

import { RatingStarsInput } from '@/components/custom/rating-stars';
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
import { submitShopReview } from '@/lib/actions/shop-social';

/**
 * "How was it?" — the shop-service review (Prompt C8).
 *
 * Only rendered once the server has confirmed a fulfilled, unreviewed order
 * from this shop, so its presence is itself the signal that the review will be
 * accepted. The action re-checks anyway and picks the order itself.
 *
 * The PROMPT TEXT names service, not merchandise. Left to itself a reviewer
 * writes about the product — that is what every other review box on the site is
 * for — and a shop reviews tab full of "nice fabric" would be worthless. The
 * placeholder asks about the phone call, the wait and the packing.
 */
export function WriteShopReviewDialog({
  shopId,
  orderReference,
  variant = 'default',
}: {
  shopId: string;
  /** Shown so the reviewer knows which visit they are being asked about. */
  orderReference: string;
  variant?: 'default' | 'outline';
}) {
  const t = useTranslations('shopPage.reviewForm');
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(5);
  const [body, setBody] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await submitShopReview({ shopId, rating, body: body.trim() || undefined });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      setOpen(false);
      setBody('');
      toast.success(t('created'));
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <PenLine />
          {t('trigger')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description', { reference: orderReference })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('ratingLabel')}</Label>
              <RatingStarsInput value={rating} onChange={setRating} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shop-review-body">{t('bodyLabel')}</Label>
              <Textarea
                id="shop-review-body"
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
