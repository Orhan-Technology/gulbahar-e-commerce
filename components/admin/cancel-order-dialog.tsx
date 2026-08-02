'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban } from 'lucide-react';
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
import { adminCancelOrder } from '@/lib/actions/admin-orders';

/** The same floor the server enforces — the button stays disabled until it is met. */
const MIN_REASON = 10;

/**
 * The mall ending an order (PRD §7.4).
 *
 * ONE COMPONENT, TWO PLACES: the order detail screen and the stalled rows in
 * the overview queue. The dialog is where the weight of the decision lives —
 * two people are about to be notified and the stock goes back on the shelf —
 * so it says who is told, in the same words on both surfaces. A second
 * implementation on the queue row would be a second set of warnings that
 * eventually says something different.
 *
 * THE REASON IS NOT OPTIONAL and the confirm button knows it. Validating only
 * on the server would mean the admin writes nothing, presses cancel, and reads
 * an error toast about a length they were never told about.
 */
export function CancelOrderDialog({
  orderId,
  reference,
  variant = 'default',
  size = 'default',
  onCancelled,
}: {
  orderId: string;
  reference: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'default';
  /** Lets the queue row collapse itself; the detail page just refreshes. */
  onCancelled?: () => void;
}) {
  const t = useTranslations('adminOrders.cancel');
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const tooShort = reason.trim().length < MIN_REASON;

  function confirm() {
    startTransition(async () => {
      const result = await adminCancelOrder({ orderId, reason });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('done', { reference }));
      setOpen(false);
      setReason('');
      onCancelled?.();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className="text-danger hover:bg-danger-bg shrink-0"
      >
        <Ban />
        {t('action')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title', { reference })}</DialogTitle>
            <DialogDescription>{t('body')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`cancel-reason-${orderId}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`cancel-reason-${orderId}`}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
            <p className="text-muted-foreground text-xs">{t('reasonNote')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('keep')}
            </Button>
            <Button variant="destructive" disabled={pending || tooShort} onClick={confirm}>
              {pending ? t('working') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
