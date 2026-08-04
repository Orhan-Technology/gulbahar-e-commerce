'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, CircleStop, Eye, MousePointerClick, X } from 'lucide-react';
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
import { approveCampaign, endCampaign, rejectCampaign } from '@/lib/actions/admin-promotions';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

export type CampaignRow = {
  id: string;
  status: 'requested' | 'approved' | 'active' | 'rejected' | 'ended';
  shopId: string;
  shopName: string;
  slotName: string;
  productTitle: string | null;
  startsAt: string;
  endsAt: string;
  weeks: number;
  pricePaid: number;
  impressions: number;
  clicks: number;
  rejectionReason: string | null;
  /**
   * Whole days left on the run, and null when it is not running (Prompt C12).
   *
   * COMPUTED ON THE SERVER and passed down: a client component may not call
   * `Date.now()` during render (React 19 purity, CLAUDE.md), and two cards
   * measured against two instants would round to different days at midnight.
   */
  daysRemaining: number | null;
};

const BADGE: Record<
  CampaignRow['status'],
  'default' | 'success' | 'warning' | 'secondary' | 'destructive'
> = {
  requested: 'warning',
  approved: 'default',
  active: 'success',
  rejected: 'destructive',
  ended: 'secondary',
};

/**
 * Campaign approvals and the running ledger (PRD §7.3).
 *
 * Requested rows sort to the top and carry the two decision buttons; everything
 * else is read-only with its performance. Rejection needs a written reason for the
 * same reason a shop rejection does — the shop has to know whether to rebook.
 *
 * `compact` is the revenue screen's dressing of the same rows: hairline-divided
 * lines inside a panel rather than free-standing cards, and the booking reduced
 * to one line of "slot · weeks · price". The ACTIONS are identical — the point
 * of sharing this component is that the rejection-reason rule cannot drift
 * between the two screens that offer the decision.
 */
export function CampaignQueue({
  campaigns,
  variant = 'full',
}: {
  campaigns: CampaignRow[];
  variant?: 'full' | 'compact';
}) {
  const t = useTranslations('adminPromotions.campaigns');

  if (campaigns.length === 0) {
    return (
      <p className="text-muted-foreground rounded-card border-border border border-dashed p-6 text-center text-sm">
        {t('none')}
      </p>
    );
  }

  if (variant === 'compact') {
    return (
      <ul className="divide-border -m-5 divide-y">
        {campaigns.map((campaign) => (
          <CompactCampaignRow key={campaign.id} campaign={campaign} />
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </ul>
  );
}

function CompactCampaignRow({ campaign }: { campaign: CampaignRow }) {
  const t = useTranslations('adminPromotions.campaigns');
  const locale = useLocale();

  return (
    <li className="space-y-2.5 p-5">
      <div>
        <Link
          href={`/admin/shops/${campaign.shopId}`}
          className="hover:text-primary text-sm font-semibold"
        >
          {campaign.shopName}
        </Link>
        <p className="mt-1 text-xs text-neutral-500">
          {[
            campaign.slotName,
            t('weeks', { n: campaign.weeks, count: formatNumber(campaign.weeks, locale) }),
            formatCurrency(campaign.pricePaid, locale),
          ].join(' · ')}
        </p>
      </div>
      <CampaignDecision campaign={campaign} fill />
    </li>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const t = useTranslations('adminPromotions.campaigns');
  const locale = useLocale();

  const ctr = campaign.impressions > 0 ? campaign.clicks / campaign.impressions : 0;
  const decidable = campaign.status === 'requested';

  return (
    <li
      className={`rounded-card space-y-3 border p-4 ${
        decidable ? 'border-warning-border bg-warning-bg' : 'border-border bg-card'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/shops/${campaign.shopId}`}
              className="hover:text-primary text-sm font-bold"
            >
              {campaign.shopName}
            </Link>
            <Badge variant={BADGE[campaign.status]}>{t(`status.${campaign.status}`)}</Badge>
          </div>
          <p className="text-sm">{campaign.slotName}</p>
          {campaign.productTitle && (
            <p className="text-muted-foreground clamp-1 text-xs">{campaign.productTitle}</p>
          )}
          <p className="text-muted-foreground text-xs">
            {formatDate(campaign.startsAt, locale)} — {formatDate(campaign.endsAt, locale)} ·{' '}
            {t('weeks', { n: campaign.weeks, count: formatNumber(campaign.weeks, locale) })}
          </p>
        </div>

        <div className="text-end">
          <p className="text-foreground text-base font-bold">
            {formatCurrency(campaign.pricePaid, locale)}
          </p>

          {/*
            THE MALL'S SIDE OF THE DEAL, beside the shop's (Prompt C12).
            The card showed impressions, clicks and a CTR — which are the
            TENANT's numbers, the ones they would ask about. What the seller
            needs is when the money runs out and when the square comes back on
            the market, because that is the next phone call. Rendered for a
            running placement only: "0 days left" on an ended campaign is a
            fact about the past dressed as a deadline.
          */}
          {campaign.daysRemaining !== null &&
            (campaign.status === 'active' || campaign.status === 'approved') && (
              <p
                className={`text-2xs mt-1 ${
                  campaign.daysRemaining <= 7 ? 'text-warning font-semibold' : 'text-muted-foreground'
                }`}
                data-days-remaining={campaign.daysRemaining}
              >
                {t('daysRemaining', {
                  n: campaign.daysRemaining,
                  count: formatNumber(campaign.daysRemaining, locale),
                })}
                {' · '}
                {t('slotReopens', { date: formatDate(campaign.endsAt, locale, 'medium') })}
              </p>
            )}

          {(campaign.status === 'active' || campaign.status === 'ended') && (
            /*
              LABELLED, not three bare glyphs. An eye, a cursor and a bare
              percentage next to each other are only decodable by someone who
              already knows this screen — and the one number a mall director
              quotes to a tenant is the click-through rate, which had no name on
              it at all. The icons stay as scanning aids; the words are what make
              the row readable out loud.
            */
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" aria-hidden />
                {t('impressions', { count: formatNumber(campaign.impressions, locale) })}
              </span>
              <span className="inline-flex items-center gap-1">
                <MousePointerClick className="h-3 w-3" aria-hidden />
                {t('clicks', { count: formatNumber(campaign.clicks, locale) })}
              </span>
              <span>{t('ctr', { value: formatPercent(ctr, locale) })}</span>
            </p>
          )}
        </div>
      </div>

      {campaign.rejectionReason && (
        <p className="rounded-control bg-danger-bg text-danger p-2 text-xs">
          {t('rejectedBecause', { reason: campaign.rejectionReason })}
        </p>
      )}

      <CampaignDecision campaign={campaign} />
    </li>
  );
}
/**
 * The approve / reject / end-early controls and the rejection dialog.
 *
 * Extracted so the revenue screen's compact queue and the promotions screen's
 * full ledger share one implementation. A rejection carries a written reason
 * because the shop has to know whether to rebook, and the five-character
 * minimum is enforced here as well as in the action.
 */
function CampaignDecision({ campaign, fill = false }: { campaign: CampaignRow; fill?: boolean }) {
  const t = useTranslations('adminPromotions.campaigns');
  const locale = useLocale();
  const router = useRouter();

  const [pending, startTransition] = React.useTransition();
  const [rejecting, setRejecting] = React.useState(false);
  const [ending, setEnding] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const decidable = campaign.status === 'requested';
  const running = campaign.status === 'active' || campaign.status === 'approved';

  function run(label: string, work: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(label as never));
      setRejecting(false);
      setEnding(false);
      setReason('');
      router.refresh();
    });
  }

  if (!decidable && !running) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {decidable && (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run('approved', () => approveCampaign(campaign.id))}
              className={fill ? 'flex-1' : undefined}
            >
              <Check />
              {t('approve')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setRejecting(true)}
              className={`text-danger hover:bg-danger-bg ${fill ? 'flex-1' : ''}`}
            >
              <X />
              {t('reject')}
            </Button>
          </>
        )}

        {running && (
          /*
            AN IRREVERSIBLE ACT, DRAWN AS ONE. This was a ghost button with a
            `Square` glyph on it — which is to say, an empty checkbox — and it
            fired immediately: one stray click took a paid placement off the
            storefront with no confirmation and no way back, on a booking the
            shop has already been charged for. A stop icon and a consequence
            dialog are the minimum a one-way door deserves.
          */
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setEnding(true)}
            className="text-danger hover:bg-danger-bg"
          >
            <CircleStop />
            {t('endEarly')}
          </Button>
        )}
      </div>

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('endTitle')}</DialogTitle>
            <DialogDescription>{t('endBody')}</DialogDescription>
          </DialogHeader>

          {/* The three facts that make this decision, named. */}
          <ul className="rounded-control border-danger-border bg-danger-bg text-danger space-y-1 border-s-2 p-3 text-xs">
            <li>{t('endConsequenceVisibility')}</li>
            <li>{t('endConsequenceMoney', { price: formatCurrency(campaign.pricePaid, locale) })}</li>
            <li>{t('endConsequenceSlot')}</li>
          </ul>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnding(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run('ended', () => endCampaign(campaign.id))}
            >
              {pending ? t('working') : t('confirmEnd')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectTitle')}</DialogTitle>
            <DialogDescription>{t('rejectBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`campaign-reason-${campaign.id}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`campaign-reason-${campaign.id}`}
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
              disabled={pending || reason.trim().length < 5}
              onClick={() =>
                run('rejected', () => rejectCampaign({ campaignId: campaign.id, reason }))
              }
            >
              {pending ? t('working') : t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
