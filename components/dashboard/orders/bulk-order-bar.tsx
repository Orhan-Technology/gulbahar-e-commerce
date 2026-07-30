'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Package, Printer, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { bulkAdvanceOrders } from '@/lib/actions/shop-orders';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type SelectableOrder = {
  id: string;
  reference: string;
  status: 'placed' | 'accepted' | 'ready' | 'fulfilled' | 'rejected';
  /**
   * The row itself, rendered on the SERVER and passed as a node.
   *
   * NOT a render prop. A function cannot cross the server→client boundary —
   * React throws "Functions are not valid as a child of Client Components" at
   * serialisation time, with a stack that points at `stringify` and names
   * nothing useful. Server-rendered ELEMENTS serialise fine, so the server
   * builds each row and this component only decides what goes beside it.
   */
  content: React.ReactNode;
};

/**
 * Bulk selection for the order list (Prompt C6).
 *
 * A shop that takes twelve orders on a Friday morning accepts them one at a
 * time, twelve dialogs deep. This is the same work in one press.
 *
 * WHAT IT DOES NOT OFFER is as deliberate as what it does: there is no bulk
 * REJECT. Rejecting is terminal, it needs a reason per order, and a control
 * that turns away nine customers in one click is one misclick from a very bad
 * morning. Accept and mark-ready are additive and reversible in practice;
 * rejection is neither.
 *
 * The checkbox column and the bar are one component because they share one
 * piece of state, and splitting them would mean lifting that state into the
 * page — which is a server component and cannot hold it.
 */
export function BulkOrderSelection({ orders }: { orders: SelectableOrder[] }) {
  const t = useTranslations('shopOrders.bulk');
  const locale = useLocale();
  const router = useRouter();

  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [pending, startTransition] = React.useTransition();

  const selectable = orders.filter(
    (order) => order.status === 'placed' || order.status === 'accepted',
  );
  const chosen = orders.filter((order) => selected.has(order.id));

  // What "accept all" would mean depends on the selection: a mixed one can only
  // do the transition every chosen order actually allows.
  const allPlaced = chosen.length > 0 && chosen.every((order) => order.status === 'placed');
  const allAccepted = chosen.length > 0 && chosen.every((order) => order.status === 'accepted');

  function toggle(id: string, next: boolean) {
    setSelected((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function run(to: 'accepted' | 'ready') {
    const ids = chosen.map((order) => order.id);

    startTransition(async () => {
      const result = await bulkAdvanceOrders(ids, to);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      const { done, failed } = result.data;
      setSelected(new Set());

      /*
       * ONE toast for the batch, and it tells the truth about partial failure.
       * Five separate toasts for five orders is a wall of green nobody reads,
       * and a single "done" that hides one failure is how a shopkeeper finds
       * out on Monday.
       */
      if (failed.length === 0) {
        toast.success(t('done', { n: done.length, count: formatNumber(done.length, locale) }));
      } else {
        toast.warning(
          t('partial', {
            done: formatNumber(done.length, locale),
            failed: formatNumber(failed.length, locale),
          }),
        );
      }

      router.refresh();
    });
  }

  return (
    <>
      {selectable.length > 1 && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            id="select-all-orders"
            checked={chosen.length > 0 && chosen.length === selectable.length}
            onCheckedChange={(value) =>
              setSelected(value === true ? new Set(selectable.map((order) => order.id)) : new Set())
            }
          />
          <label htmlFor="select-all-orders" className="text-muted-foreground text-xs">
            {t('selectAll', { count: formatNumber(selectable.length, locale) })}
          </label>
        </div>
      )}

      {orders.map((order) => (
        <div key={order.id} className="rounded-card border-border bg-card flex gap-2 border p-3">
          {order.status === 'placed' || order.status === 'accepted' ? (
            <Checkbox
              className="mt-1"
              checked={selected.has(order.id)}
              onCheckedChange={(value) => toggle(order.id, value === true)}
              aria-label={order.reference}
            />
          ) : (
            // A spacer, so rows that cannot be selected still line up with the
            // ones that can — a ragged inline edge reads as a rendering fault.
            <span className="w-4 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1 space-y-3">{order.content}</div>
        </div>
      ))}

      {/*
        A floating bar rather than a toolbar at the top: the selection is made
        by scrolling down a list, and a control that has scrolled off the screen
        is a control that is not there.
      */}
      <div
        className={cn(
          'sticky bottom-20 z-30 mx-auto flex w-fit flex-wrap items-center gap-3 rounded-pill border-border bg-card shadow-overlay border px-4 py-2 transition-[opacity,translate] duration-200 ease-out md:bottom-4',
          chosen.length === 0 && 'pointer-events-none translate-y-2 opacity-0',
        )}
        aria-hidden={chosen.length === 0}
      >
        <span className="text-sm font-semibold">
          {t('selected', { n: chosen.length, count: formatNumber(chosen.length, locale) })}
        </span>

        {allPlaced && (
          <Button size="sm" disabled={pending} onClick={() => run('accepted')}>
            <Check />
            {t('acceptAll')}
          </Button>
        )}

        {allAccepted && (
          <Button size="sm" disabled={pending} onClick={() => run('ready')}>
            <Package />
            {t('readyAll')}
          </Button>
        )}

        {/* Printing many slips: one tab each, which is what a browser's print
            queue understands. */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            for (const order of chosen) {
              window.open(`/dashboard/orders/${order.id}/slip`, '_blank');
            }
          }}
        >
          <Printer />
          {t('printAll')}
        </Button>

        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
          <X />
          {t('clear')}
        </Button>
      </div>
    </>
  );
}
