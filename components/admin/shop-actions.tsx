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

/** The floor the server enforces on every one of these reasons. */
const MIN_REASON = 10;

/**
 * Approve / reject / suspend / close (PRD §7.1).
 *
 * Approve is one tap because it is the reversible, expected outcome. Everything
 * that harms a tenant — rejection, suspension, closure — goes through a confirm
 * step AND a written reason.
 *
 * Suspension and closure used to be a bare "are you sure". Those are the two
 * decisions that stop a trading tenant earning the moment they land, and they
 * were the only ones on this surface that asked the admin for nothing and told
 * the shopkeeper nothing. The dialog now looks like the rejection dialog on
 * purpose: same shape, same floor, same promise that the text reaches the owner
 * as written.
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

      {/* Suspend / close — both take a shop off the storefront, so both confirm
          and both state why, in a sentence the owner receives verbatim. */}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming === 'closed' ? t('closeTitle') : t('suspendTitle')}
            </DialogTitle>
            <DialogDescription>
              {confirming === 'closed' ? t('closeBody') : t('suspendBody')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`status-reason-${shopId}`}>
              {confirming === 'closed' ? t('closeReasonLabel') : t('suspendReasonLabel')}
            </Label>
            <Textarea
              id={`status-reason-${shopId}`}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                confirming === 'closed' ? t('closeReasonPlaceholder') : t('suspendReasonPlaceholder')
              }
            />
            <p className="text-muted-foreground text-xs">{t('statusReasonNote')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < MIN_REASON}
              onClick={() =>
                confirming &&
                run(confirming, () => setShopStatus({ shopId, status: confirming, reason }))
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
