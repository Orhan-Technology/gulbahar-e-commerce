'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageSquareReply, Package } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { answerQuestion } from '@/lib/actions/questions';
import { respondToReview } from '@/lib/actions/shop-reviews';
import { setProductStock } from '@/lib/actions/shop-products';
import { digitsOnly } from '@/lib/digits';

/**
 * The inline controls that let EVERY queue row be finished without leaving the
 * dashboard (Prompt C4).
 *
 * Before this, orders had Accept/Reject and everything else had a chevron —
 * so the queue's promise ("act without leaving") broke halfway down the list,
 * which is worse than not making it. A row that can only be opened is a link
 * with extra steps.
 *
 * All three are OPTIMISTIC in the same shape: the row collapses immediately via
 * `onOptimistic`, and a failure calls `onRollback` and says why. The undo lives
 * in the toast rather than in a confirm dialog — see inline-order-action.tsx
 * for the argument, which applies unchanged here.
 */

type InlineProps = {
  onOptimistic: () => void;
  onRollback: () => void;
};

/** Reply to a review, in place. */
export function InlineReviewReply({
  reviewId,
  onOptimistic,
  onRollback,
}: InlineProps & { reviewId: string }) {
  const t = useTranslations('dashboard.queue');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquareReply />
        {t('replyAction')}
      </Button>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const text = body.trim();
        if (text.length < 2) return;

        startTransition(async () => {
          onOptimistic();
          const result = await respondToReview({ reviewId, body: text });
          if (!result.ok) {
            onRollback();
            toast.error(t(`errors.${result.error}` as never));
            return;
          }
          toast.success(t('replied'));
          router.refresh();
        });
      }}
    >
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        maxLength={500}
        autoFocus
        placeholder={t('replyPlaceholder')}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || body.trim().length < 2}>
          {t('send')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Answer a customer question, in place. */
export function InlineQuestionAnswer({
  questionId,
  onOptimistic,
  onRollback,
}: InlineProps & { questionId: string }) {
  const t = useTranslations('dashboard.queue');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquareReply />
        {t('answerAction')}
      </Button>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const text = body.trim();
        if (text.length < 2) return;

        startTransition(async () => {
          onOptimistic();
          const result = await answerQuestion({ questionId, body: text });
          if (!result.ok) {
            onRollback();
            toast.error(t(`errors.${result.error}` as never));
            return;
          }
          toast.success(t('answered'));
          router.refresh();
        });
      }}
    >
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        maxLength={1000}
        autoFocus
        placeholder={t('answerPlaceholder')}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || body.trim().length < 2}>
          {t('send')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Restock a product, in place.
 *
 * A number input rather than a link to the editor: the whole job is one field,
 * and the alternative is a form with a title, a price, a category and an image
 * uploader between the shopkeeper and the number they came to change.
 */
export function InlineStockUpdate({
  productId,
  onOptimistic,
  onRollback,
}: InlineProps & { productId: string }) {
  const t = useTranslations('dashboard.queue');
  const router = useRouter();
  const [value, setValue] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const stock = Number(digitsOnly(value));
        if (!Number.isInteger(stock) || stock <= 0) return;

        startTransition(async () => {
          onOptimistic();
          const result = await setProductStock(productId, stock);
          if (!result.ok) {
            onRollback();
            toast.error(t(`errors.${result.error}` as never));
            return;
          }
          toast.success(t('restocked'));
          router.refresh();
        });
      }}
    >
      <label htmlFor={`stock-${productId}`} className="text-xs font-medium">
        {t('stockLabel')}
      </label>
      <Input
        id={`stock-${productId}`}
        value={value}
        onChange={(event) => setValue(digitsOnly(event.target.value))}
        inputMode="numeric"
        dir="ltr"
        className="h-8 w-20"
        placeholder="0"
      />
      <Button type="submit" size="sm" disabled={pending || !value}>
        <Package />
        {t('saveStock')}
      </Button>
    </form>
  );
}
