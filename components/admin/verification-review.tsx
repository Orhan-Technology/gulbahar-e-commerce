'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ExternalLink, FileText, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { claimVerification, decideVerification } from '@/lib/actions/verification';

export type ReviewDocument = {
  id: string;
  kind: 'business_licence' | 'owner_id' | 'unit_agreement' | 'other';
  mime: string;
  originalName: string | null;
};

/**
 * The admin's document viewer and decision (Prompt C7).
 *
 * Documents are fetched by ID from the authenticated route — never by path.
 * The component has no idea where the file lives, which is exactly the point:
 * nothing that reaches the browser can be turned into a shareable URL for a
 * business licence.
 *
 * Images render inline because a reviewer comparing a licence against a unit
 * number should not be downloading files; PDFs get an `<embed>`, which every
 * current browser renders and which needs no library. Both go through the same
 * route and the same 404-for-strangers rule.
 *
 * APPROVAL IS NOT OPTIMISTIC. It writes a badge onto a public storefront and
 * starts a year-long clock; a five-second undo window would be a promise that
 * the badge is reversible in the way an order acceptance is, and it is not.
 * Rejection demands a reason for the same reason it does everywhere else in
 * this product: the shop has to know what to fix.
 */
export function VerificationReview({
  verificationId,
  status,
  documents,
}: {
  verificationId: string;
  status: 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired';
  documents: ReviewDocument[];
}) {
  const t = useTranslations('adminVerifications');
  const router = useRouter();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const decided = status === 'verified' || status === 'rejected';

  function decide(decision: 'verified' | 'rejected') {
    startTransition(async () => {
      const result = await decideVerification({
        verificationId,
        decision,
        reason: decision === 'rejected' ? reason : undefined,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      toast.success(t(decision === 'verified' ? 'approved' : 'rejected'));
      setRejecting(false);
      setReason('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {documents.map((document) => (
          <figure key={document.id} className="rounded-control border-border overflow-hidden border">
            <div className="flex items-center justify-between gap-2 bg-neutral-50 px-3 py-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{t(`kinds.${document.kind}` as never)}</span>
              </span>
              <a
                href={`/api/verification/${document.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-primary shrink-0"
                aria-label={t('openDocument')}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>

            {document.mime === 'application/pdf' ? (
              <embed
                src={`/api/verification/${document.id}`}
                type="application/pdf"
                className="h-64 w-full"
              />
            ) : (
              // A plain <img>: next/image would proxy a private document through
              // the image optimiser and cache it on disk, which is the one place
              // these bytes must not end up.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/verification/${document.id}`}
                alt={t(`kinds.${document.kind}` as never)}
                className="h-64 w-full bg-neutral-100 object-contain"
              />
            )}
          </figure>
        ))}
      </div>

      {decided ? (
        <Badge variant={status === 'verified' ? 'success' : 'destructive'}>
          {t(`status.${status}` as never)}
        </Badge>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => decide('verified')}>
            <Check />
            {t('approve')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-danger hover:bg-danger-bg"
            disabled={pending}
            onClick={() => setRejecting(true)}
          >
            <X />
            {t('reject')}
          </Button>

          {status === 'submitted' && (
            /* Says out loud that someone is reading it, so two admins do not
               review the same papers twice. */
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await claimVerification(verificationId);
                  router.refresh();
                })
              }
            >
              {t('claim')}
            </Button>
          )}
        </div>
      )}

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectTitle')}</DialogTitle>
            <DialogDescription>{t('rejectBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`reason-${verificationId}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`reason-${verificationId}`}
              rows={3}
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
              disabled={pending || reason.trim().length < 10}
              onClick={() => decide('rejected')}
            >
              {t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
