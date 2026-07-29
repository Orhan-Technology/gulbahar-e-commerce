'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PackageCheck, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { advanceOrderStatus } from '@/lib/actions/shop-orders';

/**
 * Advancing an order from the dashboard queue, without leaving the page
 * (PRD §6.1, §6.3).
 *
 * THE UNDO WINDOW IS BEFORE THE COMMIT, NOT AFTER IT — and that is the design,
 * not an implementation detail. Accepting an order sends the customer an SMS
 * and appends to an immutable order-event chain; neither can be taken back, and
 * `accepted → placed` is not a legal transition precisely because pretending
 * otherwise would leave a customer holding a message about an order the shop
 * had quietly un-accepted. So the row leaves the queue immediately, a toast
 * offers UNDO for a few seconds, and the server is only told once that window
 * closes. Press undo and nothing ever happened, because nothing had happened.
 *
 * Two things a bare timer gets wrong, both handled here:
 *
 *   - LEAVING THE PAGE commits at once rather than dropping the action. A
 *     shopkeeper who taps accept and immediately opens the order expects it to
 *     be accepted; discarding it because a timer had not finished would be the
 *     worst possible reading of "undo".
 *   - A REFUSED commit puts the row back and says so. Optimistic state is a
 *     prediction, and a prediction that turns out wrong has to be visibly
 *     retracted rather than left standing on screen.
 *
 * Rejection is deliberately NOT here: it is the one irreversible transition and
 * it requires a reason the customer will read, so it stays a dialog on the
 * order itself (components/dashboard/orders/order-actions.tsx).
 */
const UNDO_MS = 5000;

const ICONS = { accepted: ThumbsUp, ready: PackageCheck } as const;

export function InlineOrderAction({
  orderId,
  reference,
  to,
  onOptimistic,
  onRollback,
}: {
  orderId: string;
  reference: string;
  to: 'accepted' | 'ready';
  /** Collapse the row the moment the button is pressed. */
  onOptimistic: () => void;
  /** Put it back — undo pressed, or the server refused. */
  onRollback: () => void;
}) {
  const t = useTranslations('dashboard.queue');
  const tActions = useTranslations('shopOrders.actions');
  const router = useRouter();

  /*
   * The pending commit lives in a ref rather than in state: it is read by an
   * unmount cleanup that must see the LATEST value, and a stale closure over
   * state would commit an action the user had already undone.
   */
  const pending = React.useRef<{ timer: number; commit: () => void } | null>(null);

  const commit = React.useCallback(async () => {
    pending.current = null;
    const result = await advanceOrderStatus({ orderId, to });
    if (!result.ok) {
      onRollback();
      toast.error(tActions(`errors.${result.error}` as never));
      return;
    }
    router.refresh();
  }, [orderId, to, onRollback, router, tActions]);

  // Flush on unmount — see the note above about leaving the page.
  React.useEffect(() => {
    return () => {
      const current = pending.current;
      if (!current) return;
      clearTimeout(current.timer);
      pending.current = null;
      current.commit();
    };
  }, []);

  function run() {
    onOptimistic();

    const timer = window.setTimeout(() => void commit(), UNDO_MS);
    pending.current = { timer, commit: () => void commit() };

    toast.success(t(to === 'accepted' ? 'acceptedToast' : 'readyToast', { reference }), {
      duration: UNDO_MS,
      action: {
        label: t('undo'),
        onClick: () => {
          const current = pending.current;
          if (!current) return;
          clearTimeout(current.timer);
          pending.current = null;
          onRollback();
        },
      },
    });
  }

  const Icon = ICONS[to];

  return (
    <Button size="sm" onClick={run}>
      <Icon />
      {tActions(to === 'accepted' ? 'accept' : 'markReady')}
    </Button>
  );
}
