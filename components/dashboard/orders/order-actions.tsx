'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, PackageCheck, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CollectForm } from '@/components/dashboard/orders/collect-form';
import { OrderRejectButton } from '@/components/dashboard/orders/order-reject-button';
import { advanceOrderStatus } from '@/lib/actions/shop-orders';

type Status = 'placed' | 'accepted' | 'ready' | 'fulfilled' | 'rejected';

/**
 * The accept / reject / ready / fulfilled controls on the ORDER screen
 * (PRD §6.3).
 *
 * Only the transitions that are legal from the current status are rendered, so
 * the shopkeeper is never offered an action that will fail. The server enforces
 * the same rule — this is a courtesy, not the guard.
 *
 * Rejection lives in its own component because the action queue needs it too,
 * and only it: the queue's accept and mark-ready are optimistic with an undo
 * window, which a terminal transition carrying a customer-visible reason must
 * not be (components/dashboard/inline-order-action.tsx).
 */
export function OrderActions({
  orderId,
  status,
  fulfillment = 'delivery',
  size = 'default',
}: {
  orderId: string;
  status: Status;
  /**
   * A READY PICKUP ORDER HAS NO "mark fulfilled" BUTTON (Prompt C11).
   *
   * It is collected, not delivered, and the transition is the customer reading
   * out their code — so the control that ends it is the CollectForm, not a
   * button the shopkeeper can press with nobody standing there. Leaving both on
   * screen would make the code optional, which is the same as not having one.
   */
  fulfillment?: 'delivery' | 'pickup';
  size?: 'sm' | 'default';
}) {
  const t = useTranslations('shopOrders.actions');
  const router = useRouter();

  const [pending, startTransition] = React.useTransition();

  function run(to: 'accepted' | 'ready' | 'fulfilled') {
    startTransition(async () => {
      const result = await advanceOrderStatus({ orderId, to });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(`done.${to}` as never));
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
          <OrderRejectButton orderId={orderId} size={size} />
        </>
      )}

      {status === 'accepted' && (
        <Button size={size} onClick={() => run('ready')} disabled={pending}>
          <PackageCheck />
          {t('markReady')}
        </Button>
      )}

      {status === 'ready' && fulfillment === 'delivery' && (
        <Button size={size} onClick={() => run('fulfilled')} disabled={pending}>
          <Check />
          {t('markFulfilled')}
        </Button>
      )}

      {status === 'ready' && fulfillment === 'pickup' && <CollectForm orderId={orderId} />}
    </div>
  );
}
