'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ExternalLink, FileText, FileWarning, X } from 'lucide-react';
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
import { formatList } from '@/lib/format';

export type ReviewDocument = {
  id: string;
  kind: 'business_licence' | 'owner_id' | 'unit_agreement' | 'other';
  mime: string;
  originalName: string | null;
  /**
   * Whether the bytes are actually on disk.
   *
   * Computed on the server (lib/db/queries/verification.ts) rather than
   * discovered by the browser failing to load an <img>: a frame that renders
   * empty is indistinguishable from one still loading, and the difference
   * decides whether approval is offered.
   */
  available: boolean;
};

/** What the server decided about the evidence — never re-derived here. */
export type ReviewEvidence = {
  canApprove: boolean;
  missingKinds: string[];
  unreadableKinds: string[];
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
 * A DOCUMENT THAT CANNOT BE OPENED IS A STATE, NOT A BLANK. Both panes used to
 * render the route's bare «Not found» body inside the frame — unstyled text
 * bleeding through a designed panel, and worse, an admin could approve an
 * identity on top of it without anything on screen saying they were looking at
 * nothing. The frame now says so, and APPROVAL IS WITHDRAWN while a required
 * document is unreadable. The server refuses it too (decideVerification): this
 * is the explanation, not the enforcement.
 *
 * REJECTION STAYS AVAILABLE, with an empty box. "Your licence did not arrive"
 * is a legitimate verdict and often the correct one — a submission that could
 * be neither approved nor rejected would strand the shop in the queue forever.
 * Nothing is pre-filled: the reason reaches the shopkeeper verbatim, and a
 * sentence the admin did not write is a sentence they did not mean.
 *
 * APPROVAL IS NOT OPTIMISTIC. It writes a badge onto a public storefront and
 * starts a year-long clock; a five-second undo window would be a promise that
 * the badge is reversible in the way an order acceptance is, and it is not.
 */
export function VerificationReview({
  verificationId,
  status,
  documents,
  evidence,
}: {
  verificationId: string;
  status: 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired';
  documents: ReviewDocument[];
  evidence: ReviewEvidence;
}) {
  const t = useTranslations('adminVerifications');
  const locale = useLocale();
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

  const blockers = [
    ...evidence.unreadableKinds.map((kind) => t(`kinds.${kind}` as never)),
    ...evidence.missingKinds.map((kind) => t(`kinds.${kind}` as never)),
  ];

  return (
    <div className="space-y-4">
      {/*
        DOCUMENTS BESIDE THE DECISION, from `xl`. The queue used to be a single
        700px column on a console that is desktop-first by design, so a reviewer
        scrolled past the licence to reach the buttons and decided from memory.
        Below `xl` it stacks, because two 300px documents side by side are two
        documents nobody can read.
      */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        {documents.length === 0 ? (
          <NoDocumentsPanel label={t('noDocumentsTitle')} body={t('noDocumentsBody')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {documents.map((document) => (
              <DocumentFrame key={document.id} document={document} />
            ))}
          </div>
        )}

        <div className="rounded-control border-border space-y-3 border p-3">
          <p className="text-xs font-bold">{t('decisionHeading')}</p>

          {decided ? (
            <Badge variant={status === 'verified' ? 'success' : 'destructive'}>
              {t(`status.${status}` as never)}
            </Badge>
          ) : (
            <>
              {/*
                The explanation sits ABOVE the disabled button, not in a tooltip
                on it: a control that cannot be pressed and does not say why is a
                dead end, and a tooltip is invisible to anyone reading the screen
                rather than pointing at it.
              */}
              {!evidence.canApprove && (
                <p
                  className="rounded-control border-warning-border bg-warning-bg text-warning-fg border-s-2 p-3 text-xs leading-relaxed"
                  data-approve-blocked
                >
                  {/* `formatList`, not a hard-coded separator: «الف، ب» in Dari and
                  "A and B" in English are different joins, and an Arabic comma
                  in an English sentence reads as a full stop. */}
              {t('cannotApprove', { documents: formatList(blockers, locale) })}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pending || !evidence.canApprove}
                  onClick={() => decide('verified')}
                >
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
                  /* Says out loud that someone is reading it, so two admins do
                     not review the same papers twice. */
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
            </>
          )}
        </div>
      </div>

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

/** One document, or a designed account of why there is nothing to look at. */
function DocumentFrame({ document }: { document: ReviewDocument }) {
  const t = useTranslations('adminVerifications');
  const label = t(`kinds.${document.kind}` as never);

  return (
    <figure className="rounded-control border-border overflow-hidden border">
      <div className="flex items-center justify-between gap-2 bg-neutral-50 px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          {document.available ? (
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <FileWarning className="text-danger h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{label}</span>
        </span>

        {/* No "open in a new tab" on a document that cannot be opened — the
            link would hand the reader the same 404 in a bigger window. */}
        {document.available && (
          <a
            href={`/api/verification/${document.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-primary shrink-0"
            aria-label={t('openDocument')}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>

      {!document.available ? (
        <div
          className="flex h-64 flex-col items-center justify-center gap-2 bg-neutral-50 p-4 text-center"
          data-document-state="unavailable"
        >
          <FileWarning className="text-muted-foreground h-6 w-6" aria-hidden />
          <p className="text-sm font-semibold">{t('documentUnavailableTitle')}</p>
          <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
            {t('documentUnavailableBody', { kind: label })}
          </p>
        </div>
      ) : document.mime === 'application/pdf' ? (
        <embed
          src={`/api/verification/${document.id}`}
          type="application/pdf"
          className="h-64 w-full"
        />
      ) : (
        // A plain <img>: next/image would proxy a private document through
        // the image optimiser and cache it on disk, which is the one place
        // these bytes must not end up.
        // `contain` on a tinted ground, because a scanned licence is a portrait
        // page in a landscape frame and cropping it would cut the stamp off.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/verification/${document.id}`}
          alt={label}
          className="h-64 w-full bg-neutral-100 object-contain"
        />
      )}
    </figure>
  );
}

/** A submission with no document rows at all — rarer, and worse. */
function NoDocumentsPanel({ label, body }: { label: string; body: string }) {
  return (
    <div
      className="rounded-control border-border flex flex-col items-center justify-center gap-2 border border-dashed bg-neutral-50 p-8 text-center"
      data-document-state="none"
    >
      <FileWarning className="text-muted-foreground h-6 w-6" aria-hidden />
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">{body}</p>
    </div>
  );
}
