'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, PackageCheck, ThumbsUp, X } from 'lucide-react';
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

type Status = 'placed' | 'accepted' | 'ready' | 'fulfilled' | 'rejected';

/**
 * The accept / reject / ready / fulfilled controls (PRD §6.3).
 *
 * Only the transitions that are legal from the current status are rendered, so
 * the shopkeeper is never offered an action that will fail. The server enforces
 * the same rule — this is a courtesy, not the guard.
 *
 * Rejection opens a dialog for the reason rather than rejecting on tap: it is the
 * one destructive, irreversible transition, and the customer is told the reason.
 */
export function OrderActions({
  orderId,
  status,
  size = 'default',
}: {
  orderId: string;
  status: Status;
  size?: 'sm' | 'default';
}) {
  const t = useTranslations('shopOrders.actions');
  const router = useRouter();

  const [pending, startTransition] = React.useTransition();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');

  function run(to: 'accepted' | 'ready' | 'fulfilled' | 'rejected', withReason?: string) {
    startTransition(async () => {
      const result = await advanceOrderStatus({ orderId, to, reason: withReason });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(`done.${to}` as never));
      setRejecting(false);
      setReason('');
      router.refresh();
    });
  }

  if (status === 'fulfilled' || status === 'rejected') return null;

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'placed' && (
        <>
          <Button size={size} onClick={() => run('accepted')} disabled={pending}>
            <ThumbsUp />
            {t('accept')}
          </Button>
          <Button
            size={size}
            variant="outline"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="text-danger hover:bg-danger-bg"
          >
            <X />
            {t('reject')}
          </Button>
        </>
      )}

      {status === 'accepted' && (
        <Button size={size} onClick={() => run('ready')} disabled={pending}>
          <PackageCheck />
          {t('markReady')}
        </Button>
      )}

      {status === 'ready' && (
        <Button size={size} onClick={() => run('fulfilled')} disabled={pending}>
          <Check />
          {t('markFulfilled')}
        </Button>
      )}

      <Dialog open={rejecting} onOpenChange={setRejecting}>
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
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => run('rejected', reason)}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? t('rejecting') : t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
