'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleSlash } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cancelOrder } from '@/lib/actions/orders';

/**
 * The customer ends their own order (PRD §13.2).
 *
 * ONLY WHILE IT IS STILL `placed`, which is why this renders nothing at all
 * once the shop has accepted: an action that is going to be refused should not
 * be on screen, and "cancel" greyed out with no explanation is worse than
 * absent. After that point the order page tells them to call the shop instead.
 *
 * BEHIND A CONFIRMATION, unlike the cart's undoable removal. This one cannot be
 * walked back — `cancelled` is terminal, the shop is told, and re-placing means
 * rebuilding the basket at whatever today's prices and stock are. The dialog
 * says exactly that rather than asking "are you sure?", which is a question
 * nobody has ever answered informatively.
 */
export function CancelOrderButton({
  orderId,
  className,
}: {
  orderId: string;
  className?: string;
}) {
  const t = useTranslations('orders.cancel');
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await cancelOrder({ orderId });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        // A refusal is nearly always "the shop just accepted it", and the page
        // in front of them is now out of date — so refresh rather than leave
        // them looking at a button that will keep failing.
        router.refresh();
        setOpen(false);
        return;
      }
      toast.success(t('done'));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={pending}
        className={className ?? 'text-danger hover:bg-danger-bg'}
      >
        <CircleSlash />
        {t('action')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {/* The destructive action is not the default focus, and the way out
                sits beside it — same rule as the shopkeeper's release dialog. */}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('keep')}
            </Button>
            <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? t('cancelling') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
