'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BellRing, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { moderateReview, nudgeShopAboutOrder } from '@/lib/actions/admin-catalogue';

/**
 * The admin queue's remaining inline actions (Prompt C4).
 *
 * Pending shops and requested campaigns already decided on the row; reported
 * reviews and stalled orders had a chevron, so half the admin's queue was a
 * list of places to go rather than a list of things to do.
 */

type InlineProps = {
  onOptimistic: () => void;
  onRollback: () => void;
};

/**
 * Hide or keep a reported review, from the row.
 *
 * Both outcomes are offered, because "reported" is not "guilty": most reports
 * are a shop disliking a three-star review, and an admin who can only hide will
 * eventually hide one to clear the queue. Keeping is the one-click answer.
 */
export function InlineReviewModeration({
  reviewId,
  onOptimistic,
  onRollback,
}: InlineProps & { reviewId: string }) {
  const t = useTranslations('adminOverview.queue');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function decide(decision: 'remove' | 'uphold') {
    startTransition(async () => {
      onOptimistic();
      const result = await moderateReview({ reviewId, decision });
      if (!result.ok) {
        onRollback();
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(decision === 'remove' ? 'reviewHidden' : 'reviewKept'));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => decide('uphold')}>
        <Eye />
        {t('keepReview')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="hover:text-danger text-neutral-600"
        disabled={pending}
        onClick={() => decide('remove')}
      >
        <EyeOff />
        {t('hideReview')}
      </Button>
    </div>
  );
}

/**
 * Nudge the shop sitting on an order.
 *
 * NOT "accept on their behalf". Mall management does not reach inside a
 * tenant's transaction (PRD §3.1) — it makes sure the tenant knows. The row
 * stays in the queue afterwards, because the order is still unanswered; what
 * changed is that the shopkeeper has been told.
 */
export function InlineNudgeShop({ orderId }: { orderId: string }) {
  const t = useTranslations('adminOverview.queue');
  const router = useRouter();
  const [sent, setSent] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending || sent}
      onClick={() =>
        startTransition(async () => {
          const result = await nudgeShopAboutOrder(orderId);
          if (!result.ok) {
            toast.error(t(`errors.${result.error}` as never));
            return;
          }
          setSent(true);
          toast.success(t('nudged'));
          router.refresh();
        })
      }
    >
      <BellRing />
      {sent ? t('nudgedShort') : t('nudge')}
    </Button>
  );
}
