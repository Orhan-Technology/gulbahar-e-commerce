'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Truck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { advanceOrderStatus } from '@/lib/actions/shop-orders';

/**
 * "Handed over" — the last step of a DELIVERY order, from the queue row.
 *
 * A ready delivery is a parcel the shop still has to move, and until it was
 * added to the queue there was no way to finish one without opening the order.
 * Separate from InlineOrderAction rather than a third value on its `to` prop,
 * because that component belongs to the orders workstream and its prop is typed
 * to the two transitions it offers; this composes the same server action
 * instead of editing it.
 *
 * NO UNDO WINDOW, deliberately — the opposite choice from accept/ready. Those
 * are predictions the shopkeeper makes at a keyboard; this one is pressed after
 * the goods have physically left, and there is nothing an undo could take back.
 * A failure still rolls the row back and says why, which is the part that
 * matters.
 */
export function InlineHandoverAction({
  orderId,
  reference,
  onOptimistic,
  onRollback,
}: {
  orderId: string;
  reference: string;
  onOptimistic: () => void;
  onRollback: () => void;
}) {
  const t = useTranslations('dashboard.queue');
  const tActions = useTranslations('shopOrders.actions');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run() {
    startTransition(async () => {
      onOptimistic();
      const result = await advanceOrderStatus({ orderId, to: 'fulfilled' });
      if (!result.ok) {
        onRollback();
        toast.error(tActions(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('handedOverToast', { reference }));
      router.refresh();
    });
  }

  return (
    <Button size="sm" onClick={run} disabled={pending}>
      <Truck />
      {t('handedOver')}
    </Button>
  );
}
