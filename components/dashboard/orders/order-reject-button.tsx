'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { advanceOrderStatus } from '@/lib/actions/shop-orders';

/**
 * Rejecting an order (PRD §6.3).
 *
 * Extracted so the order detail screen and the dashboard action queue offer the
 * SAME control rather than two that drift apart — the queue previously had to
 * render the whole `OrderActions` set to get a reject button, which is why it
 * could not also carry an optimistic accept.
 *
 * Deliberately NOT optimistic, unlike accept and mark-ready. Rejection is
 * terminal, it is the one transition a shopkeeper cannot walk back, and the
 * reason typed here is sent to the customer verbatim. The dialog IS the undo
 * window: everything is still cancellable right up to the confirm.
 */
export function OrderRejectButton({
  orderId,
  size = 'default',
  className,
}: {
  orderId: string;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const t = useTranslations('shopOrders.actions');
  const router = useRouter();

  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  function reject() {
    startTransition(async () => {
      const result = await advanceOrderStatus({ orderId, to: 'rejected', reason });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('done.rejected'));
      setOpen(false);
      setReason('');
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={pending}
        className={className ?? 'text-danger hover:bg-danger-bg'}
      >
        <X />
        {t('reject')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectTitle')}</DialogTitle>
            <DialogDescription>{t('rejectBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`reason-${orderId}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`reason-${orderId}`}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
            {/* The reason is sent to the customer verbatim, so say so. */}
            <p className="text-muted-foreground text-xs">{t('reasonNote')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={reject}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? t('rejecting') : t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
