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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CallCustomerLink } from '@/components/dashboard/orders/call-customer-link';
import { advanceOrderStatus } from '@/lib/actions/shop-orders';
import { ORDER_CANCEL_REASONS, type OrderRejectReason } from '@/lib/order-reject-reasons';
import { cn } from '@/lib/utils';

/**
 * Cancelling an order the shop has ALREADY ACCEPTED (PRD §6.3, §13.2).
 *
 * A different control from reject, and a different word, because the customer's
 * situation is different: they were told the order was coming, and possibly
 * that it was ready to collect. Rejection is a door closing before anything
 * happened; this is a promise being withdrawn, so the reason is REQUIRED here
 * exactly as it is there — and the list is its own, because "wrong price" is a
 * reason to refuse an order, never a reason to break one already accepted.
 *
 * The goods go back on the shelf as part of the same transaction
 * (lib/actions/shop-orders.ts), so nothing has to be remembered afterwards.
 *
 * Not optimistic and not undoable, for the same reason rejection is not: the
 * customer is told the moment it commits. The dialog IS the undo window.
 */
export function OrderCancelButton({
  orderId,
  size = 'default',
  className,
  customerPhone,
}: {
  orderId: string;
  size?: 'sm' | 'default';
  className?: string;
  /** The customer's number, when the caller has it — see CallCustomerLink. */
  customerPhone?: string | null;
}) {
  const t = useTranslations('shopOrders.actions');
  const router = useRouter();

  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [reasonCode, setReasonCode] = React.useState<OrderRejectReason | null>(null);
  const [reason, setReason] = React.useState('');

  function cancel() {
    if (!reasonCode) return;

    startTransition(async () => {
      const result = await advanceOrderStatus({
        orderId,
        to: 'cancelled',
        reasonCode,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('done.cancelled'));
      setOpen(false);
      setReasonCode(null);
      setReason('');
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={pending}
        className={className ?? 'text-danger hover:bg-danger-bg'}
      >
        <CircleSlash />
        {t('cancelOrder')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancelTitle')}</DialogTitle>
            <DialogDescription>{t('cancelBody')}</DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('cancelReasonLabel')}</legend>
            <div className="flex flex-wrap gap-2">
              {ORDER_CANCEL_REASONS.map((code) => (
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

          {/* Ring them once more before breaking a promise — see the component. */}
          {reasonCode === 'customer_unreachable' && customerPhone && (
            <CallCustomerLink phone={customerPhone} />
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`cancel-reason-${orderId}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`cancel-reason-${orderId}`}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
            <p className="text-muted-foreground text-xs">{t('reasonNote')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={pending || !reasonCode}>
              {pending ? t('cancelling') : t('confirmCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
