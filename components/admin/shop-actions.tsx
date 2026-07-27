'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
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
import { approveShop, rejectShop, setShopStatus } from '@/lib/actions/admin-shops';

type ShopStatus = 'pending' | 'approved' | 'suspended' | 'closed';

/**
 * Approve / reject / suspend / close (PRD §7.1).
 *
 * Approve is one tap because it is the reversible, expected outcome. Everything
 * that harms a tenant — rejection, suspension, closure — goes through a confirm
 * step, and rejection additionally requires a written reason, because the
 * shopkeeper has to know what to amend before resubmitting (PRD §13.1).
 */
export function ShopActions({
  shopId,
  status,
  size = 'default',
}: {
  shopId: string;
  status: ShopStatus;
  size?: 'sm' | 'default';
}) {
  const t = useTranslations('adminShops.actions');
  const router = useRouter();

  const [pending, startTransition] = React.useTransition();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [confirming, setConfirming] = React.useState<'suspended' | 'closed' | null>(null);

  function run(label: string, work: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(label as never));
      setRejecting(false);
      setConfirming(null);
      setReason('');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(status === 'pending' || status === 'suspended') && (
        <Button
          size={size}
          onClick={() => run('approved', () => approveShop(shopId))}
          disabled={pending}
        >
          <Check />
          {status === 'suspended' ? t('reinstate') : t('approve')}
        </Button>
      )}

      {status === 'pending' && (
        <Button
          size={size}
          variant="outline"
          onClick={() => setRejecting(true)}
          disabled={pending}
          className="text-danger hover:bg-danger-bg"
        >
          <XCircle />
          {t('reject')}
        </Button>
      )}

      {status === 'approved' && (
        <Button
          size={size}
          variant="outline"
          onClick={() => setConfirming('suspended')}
          disabled={pending}
        >
          <PauseCircle />
          {t('suspend')}
        </Button>
      )}

      {status !== 'closed' && status !== 'pending' && (
        <Button
          size={size}
          variant="ghost"
          onClick={() => setConfirming('closed')}
          disabled={pending}
          className="hover:text-danger text-neutral-600"
        >
          <XCircle />
          {t('close')}
        </Button>
      )}

      {status === 'closed' && (
        <Button
          size={size}
          variant="outline"
          onClick={() => run('reinstated', () => setShopStatus({ shopId, status: 'approved' }))}
          disabled={pending}
        >
          <PlayCircle />
          {t('reinstate')}
        </Button>
      )}

      {/* Rejection — reason required, and it reaches the shopkeeper verbatim. */}
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectTitle')}</DialogTitle>
            <DialogDescription>{t('rejectBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`reject-${shopId}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`reject-${shopId}`}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
            <p className="text-muted-foreground text-xs">{t('reasonNote')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => run('rejected', () => rejectShop({ shopId, reason }))}
              disabled={pending || reason.trim().length < 10}
            >
              {pending ? t('working') : t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend / close — both take a shop off the storefront, so both confirm. */}
      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming === 'closed' ? t('closeTitle') : t('suspendTitle')}
            </DialogTitle>
            <DialogDescription>
              {confirming === 'closed' ? t('closeBody') : t('suspendBody')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                confirming && run(confirming, () => setShopStatus({ shopId, status: confirming }))
              }
            >
              {pending ? t('working') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
