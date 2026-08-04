'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ExternalLink, FileText, FileWarning, Hand, X } from 'lucide-react';
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
import { formatList, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

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
  claim,
  claimedBy,
}: {
  verificationId: string;
  status: 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired';
  documents: ReviewDocument[];
  evidence: ReviewEvidence;
  /**
   * WHAT THE PAPERS ARE MEANT TO MATCH (Prompt C12).
   *
   * The reviewer saw a licence and a tazkira and nothing that said whose they
   * were supposed to be — the comparison that IS the job happened between the
   * screen and their memory of the row above. Rendered between the two panes,
   * so name, number and both documents are in one eyeline.
   */
  claim: { ownerName: string | null; ownerPhone: string | null; shopPhone: string | null };
  /** The admin who took it, from the audit log. Null while nobody has. */
  claimedBy: string | null;
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

  /*
   * The documents split in half, so the claim sits BETWEEN them rather than
   * above or below. With two papers — the usual case, a licence and a tazkira
   * — that is one on each side of the name they are supposed to carry, which is
   * the comparison the reviewer is actually making. It generalises: four
   * documents give two and two, one gives the claim as its neighbour.
   */
  const split = Math.ceil(documents.length / 2);
  const leftDocuments = documents.slice(0, split);
  const rightDocuments = documents.slice(split);

  const claimPanel = (
    <aside
      className="rounded-control border-primary-200 bg-primary-50 shrink-0 space-y-2 border p-3 sm:w-48"
      data-verification-claim
    >
      <p className="text-primary-800 text-2xs font-bold">{t('claimHeading')}</p>

      <div>
        <p className="text-muted-foreground text-2xs">{t('claimOwnerLabel')}</p>
        <p className="text-sm font-semibold">{claim.ownerName || t('claimOwnerUnknown')}</p>
      </div>

      {claim.ownerPhone && (
        <div>
          <p className="text-muted-foreground text-2xs">{t('claimPhoneLabel')}</p>
          {/* `dir="ltr"` and a `tel:` link: an Afghan number typed into an RTL
              paragraph reverses at the bidi boundary, and this is the number
              the reviewer rings when the tazkira and the licence disagree. */}
          <a
            href={`tel:${claim.ownerPhone}`}
            dir="ltr"
            className="hover:text-primary block text-sm font-semibold tabular-nums"
          >
            {formatPhone(claim.ownerPhone, locale)}
          </a>
        </div>
      )}

      {/* The SHOP's public number, when it is a different one — a licence in a
          company name is checked against the business, not the person. */}
      {claim.shopPhone && claim.shopPhone !== claim.ownerPhone && (
        <div>
          <p className="text-muted-foreground text-2xs">{t('claimShopPhoneLabel')}</p>
          <span dir="ltr" className="block text-sm tabular-nums">
            {formatPhone(claim.shopPhone, locale)}
          </span>
        </div>
      )}

      <p className="text-muted-foreground text-2xs leading-relaxed">{t('claimNote')}</p>
    </aside>
  );

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
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <NoDocumentsPanel label={t('noDocumentsTitle')} body={t('noDocumentsBody')} />
            {/* The claim survives an empty submission: "no papers from Karim
                Nabizada on 0700…" is a more useful sentence than "no papers". */}
            {claimPanel}
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="grid min-w-0 flex-1 gap-3">
              {leftDocuments.map((document) => (
                <DocumentFrame key={document.id} document={document} />
              ))}
            </div>

            {claimPanel}

            {rightDocuments.length > 0 && (
              <div className="grid min-w-0 flex-1 gap-3">
                {rightDocuments.map((document) => (
                  <DocumentFrame key={document.id} document={document} />
                ))}
              </div>
            )}
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

              {/*
                THE CLAIM CONTROL, DRAWN AS AN ACTION (Prompt C12).
                «من بررسی می‌کنم» was a ghost button sitting third behind approve
                and reject — the quietest treatment this component has, on the
                one control an admin is meant to press FIRST. It now leads the
                panel as a bordered button on its own line, and once taken it is
                replaced by the name of whoever holds it, because "someone is
                reading this" is only useful if you can tell whether that
                someone is you.
              */}
              {status === 'submitted' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  data-claim-control
                  onClick={() =>
                    startTransition(async () => {
                      await claimVerification(verificationId);
                      router.refresh();
                    })
                  }
                >
                  <Hand />
                  {t('claim')}
                </Button>
              ) : (
                status === 'under_review' && (
                  <p
                    className="rounded-control bg-primary-50 text-primary-800 flex items-center gap-1.5 p-2 text-xs font-medium"
                    data-claim-holder
                  >
                    <Hand className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {claimedBy ? t('claimedBy', { name: claimedBy }) : t('claimedUnknown')}
                  </p>
                )
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
                  className={cn('text-danger hover:bg-danger-bg')}
                  disabled={pending}
                  onClick={() => setRejecting(true)}
                >
                  <X />
                  {t('reject')}
                </Button>
              </div>

              {/*
                WHAT REJECTION DOES, before it is pressed rather than inside the
                dialog it opens. A reviewer looking at an unreadable licence
                needs to know that rejecting is not a door closing on the tenant
                — the message reaches them and they can send the papers again —
                because the alternative is leaving the submission in the queue
                to avoid being unfair.
              */}
              <p className="text-muted-foreground text-2xs leading-relaxed" data-reject-consequence>
                {t('rejectConsequence')}
              </p>
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
