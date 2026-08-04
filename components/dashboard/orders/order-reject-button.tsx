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
import { CallCustomerLink } from '@/components/dashboard/orders/call-customer-link';
import { advanceOrderStatus } from '@/lib/actions/shop-orders';
import { ORDER_REJECT_REASONS, type OrderRejectReason } from '@/lib/order-reject-reasons';
import { cn } from '@/lib/utils';

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
  customerPhone,
}: {
  orderId: string;
  size?: 'sm' | 'default';
  className?: string;
  /**
   * The customer's number, when the caller has it.
   *
   * Optional because the dashboard queue does not carry one — see the call
   * below for why the dialog wants it.
   */
  customerPhone?: string | null;
}) {
  const t = useTranslations('shopOrders.actions');
  const router = useRouter();

  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [reasonCode, setReasonCode] = React.useState<OrderRejectReason | null>(null);
  const [reason, setReason] = React.useState('');

  function reject() {
    if (!reasonCode) return;

    startTransition(async () => {
      const result = await advanceOrderStatus({
        orderId,
        to: 'rejected',
        reasonCode,
        // Optional now: the code carries the meaning, and this adds detail when
        // the shopkeeper has any. Requiring a sentence fifty times a month is a
        // tax, and taxes get avoided.
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('done.rejected'));
      setOpen(false);
      setReasonCode(null);
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

          {/*
            THE CODE FIRST (Prompt C6). It is what the customer's message is
            written from — in THEIR language, not the shopkeeper's — and what
            the mall counts when it looks at a shop's rejection rate.
          */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('reasonCodeLabel')}</legend>
            <div className="flex flex-wrap gap-2">
              {ORDER_REJECT_REASONS.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setReasonCode(code)}
                  aria-pressed={reasonCode === code}
                  className={cn(
                    'rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                    reasonCode === code
                      ? 'border-primary bg-primary-50 text-primary font-semibold'
                      : 'border-border bg-card hover:border-primary',
                  )}
                >
                  {t(`rejectReasons.${code}` as never)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Ring them once more before turning them away — see the component. */}
          {reasonCode === 'customer_unreachable' && customerPhone && (
            <CallCustomerLink phone={customerPhone} />
          )}

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
              disabled={pending || !reasonCode}
            >
              {pending ? t('rejecting') : t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
