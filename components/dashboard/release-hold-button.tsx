'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PackageX } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { releaseExpiredHold } from '@/lib/actions/shop-orders';

/**
 * Release an unclaimed hold and put the goods back (Prompt C11).
 *
 * BEHIND A CONFIRMATION, unlike every other inline queue action in this
 * console. The others are reversible in one tap — a wrongly accepted order can
 * still be rejected — and this one cancels somebody's shopping and moves stock.
 * The dialog names the order so the shopkeeper can check they are releasing the
 * parcel they think they are.
 *
 * No optimistic update: the row disappears when the server says so. An
 * optimistic removal here would show a released hold that failed to release,
 * and the shopkeeper would put goods back on the shelf that are still promised.
 *
 * Built on Dialog rather than a separate AlertDialog primitive — this codebase
 * has one dialog and adding a second that looks identical is two components to
 * keep in step for no visible gain. The distinction that matters is behavioural
 * and is kept here: the destructive action is not the default focus, and the
 * cancel sits beside it.
 */
export function ReleaseHoldButton({
  orderId,
  reference,
}: {
  orderId: string;
  reference: string;
}) {
  const t = useTranslations('shopOrders.holds');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  function release() {
    startTransition(async () => {
      const result = await releaseExpiredHold(orderId);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('released', { count: String(result.data.restored) }));
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={pending} className="shrink-0">
          <PackageX />
          {t('release')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>{t('confirmBody', { reference })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              release();
            }}
          >
            <PackageX />
            {t('release')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
