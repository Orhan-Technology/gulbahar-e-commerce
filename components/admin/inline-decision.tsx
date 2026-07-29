'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
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
import { approveCampaign, rejectCampaign } from '@/lib/actions/admin-promotions';
import { approveShop, rejectShop } from '@/lib/actions/admin-shops';

/**
 * Approve / reject, on the row, from the admin action centre (PRD §7.1, §7.3).
 *
 * The undo window sits BEFORE the commit, exactly as it does on the shopkeeper's
 * queue and for the same reason: approving a shop sends its owner an SMS and
 * makes their whole catalogue publicly visible, and there is no un-sending
 * either. The row leaves at once, a toast offers undo for five seconds, and the
 * server is told when that window closes — so undo means nothing happened,
 * rather than something happened and was then reversed.
 *
 * This is also the demo's live moment (docs/DEMO-RUNBOOK.md): the presenter
 * approves the pending shop from the overview and its products appear on the
 * storefront. The five-second delay is invisible there — the toast and the row
 * animate immediately — and it is the difference between a rehearsal that can
 * be backed out of and one that cannot.
 *
 * REJECTION IS NOT OPTIMISTIC, for both kinds. It is terminal, it demands a
 * reason, and that reason is sent to the tenant verbatim. The dialog is the
 * undo window: nothing has happened until confirm.
 */
const UNDO_MS = 5000;

/**
 * Minimum rejection reason, per kind, mirroring the server schemas.
 *
 * They genuinely differ — 10 characters for a shop, 5 for a campaign — because
 * a rejected shop has to know what to amend before resubmitting (PRD §13.1)
 * while a rejected placement usually needs one word. Taking the stricter number
 * for both would block a legitimate campaign rejection; taking the looser one
 * would let a shop rejection fail server-side with an error the admin cannot
 * act on. So the button reads the same table the action does.
 */
const MIN_REASON = { shop: 10, campaign: 5 } as const;

type Kind = 'shop' | 'campaign';

export function InlineDecision({
  kind,
  id,
  onOptimistic,
  onRollback,
}: {
  kind: Kind;
  id: string;
  onOptimistic: () => void;
  onRollback: () => void;
}) {
  const t = useTranslations('adminOverview.queue');
  const router = useRouter();

  const pending = React.useRef<{ timer: number; commit: () => void } | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, startTransition] = React.useTransition();

  const commit = React.useCallback(async () => {
    pending.current = null;
    const result = kind === 'shop' ? await approveShop(id) : await approveCampaign(id);
    if (!result.ok) {
      onRollback();
      toast.error(t(`errors.${result.error}` as never));
      return;
    }
    router.refresh();
  }, [kind, id, onRollback, router, t]);

  // Leaving the page commits rather than dropping the approval — see the note
  // on the shopkeeper's inline order action for why that is the safer default.
  React.useEffect(() => {
    return () => {
      const current = pending.current;
      if (!current) return;
      clearTimeout(current.timer);
      pending.current = null;
      current.commit();
    };
  }, []);

  function approve() {
    onOptimistic();

    const timer = window.setTimeout(() => void commit(), UNDO_MS);
    pending.current = { timer, commit: () => void commit() };

    toast.success(t(kind === 'shop' ? 'shopApprovedToast' : 'campaignApprovedToast'), {
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

  function reject() {
    startTransition(async () => {
      const result =
        kind === 'shop'
          ? await rejectShop({ shopId: id, reason })
          : await rejectCampaign({ campaignId: id, reason });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(kind === 'shop' ? 'shopRejectedToast' : 'campaignRejectedToast'));
      setRejecting(false);
      setReason('');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={approve} disabled={busy}>
        <Check />
        {t('approve')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setRejecting(true)}
        disabled={busy}
        className="text-danger hover:bg-danger-bg"
      >
        <X />
        {t('reject')}
      </Button>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(kind === 'shop' ? 'rejectShopTitle' : 'rejectCampaignTitle')}</DialogTitle>
            <DialogDescription>
              {t(kind === 'shop' ? 'rejectShopBody' : 'rejectCampaignBody')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`admin-reason-${id}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`admin-reason-${id}`}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
            {/* Sent to the tenant verbatim, so say so. */}
            <p className="text-muted-foreground text-xs">{t('reasonNote')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={reject}
              disabled={busy || reason.trim().length < MIN_REASON[kind]}
            >
              {t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
