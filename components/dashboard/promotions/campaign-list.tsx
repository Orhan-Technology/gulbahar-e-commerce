'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, MousePointerClick, RefreshCw, Timer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cancelCampaignRequest, renewCampaign } from '@/lib/actions/shop-promotions';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';

export type CampaignRow = {
  id: string;
  status: 'requested' | 'approved' | 'active' | 'rejected' | 'ended';
  slotName: string;
  productTitle: string | null;
  startsAt: string;
  endsAt: string;
  pricePaid: number;
  impressions: number;
  clicks: number;
  daysLeft: number;
  rejectionReason: string | null;
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
 * Running and past campaigns with their performance (PRD §6.4).
 *
 * Impressions and clicks are seeded for the demo (PRD §15); the click-through rate
 * is derived rather than stored so it can never disagree with the two numbers it
 * is computed from.
 */
export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
  const t = useTranslations('shopPromotions.campaigns');

  return (
    <ul className="space-y-2">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
      {campaigns.length === 0 && (
        <li className="text-muted-foreground rounded-card border-border border border-dashed p-4 text-center text-sm">
          {t('none')}
        </li>
      )}
    </ul>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const t = useTranslations('shopPromotions.campaigns');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const ctr = campaign.impressions > 0 ? campaign.clicks / campaign.impressions : 0;
  const endingSoon = campaign.status === 'active' && campaign.daysLeft <= 7;

  return (
    <li className="rounded-card border-border bg-card space-y-2 border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium" dir="auto">
            {campaign.slotName}
          </p>
          {campaign.productTitle && (
            // User-generated, so it sets its own base direction.
            <p className="text-muted-foreground clamp-1 text-xs" dir="auto">
              {campaign.productTitle}
            </p>
          )}
          {/*
            EVERY NUMERIC FRAGMENT IS ISOLATED (Prompt C15).
            «۱۴ اسد — ۳۱ اسد · ؋۵٬۰۰۰» in one RTL text node let the bidi
            algorithm reorder across the separators: the second date's «۳۱»
            broke off and floated to the far end of the line, so the card
            advertised a range that started nowhere. `<bdi>` is exactly the
            element for a run of text whose direction must not leak into its
            neighbours, and the separators are their own spans so nothing is
            resolved across them.
          */}
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
            <bdi>{formatDate(campaign.startsAt, locale)}</bdi>
            <span aria-hidden>—</span>
            <bdi>{formatDate(campaign.endsAt, locale)}</bdi>
            <span aria-hidden>·</span>
            <bdi className="tabular-nums">{formatCurrency(campaign.pricePaid, locale)}</bdi>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={BADGE[campaign.status]}>{t(`status.${campaign.status}`)}</Badge>
          {endingSoon && (
            <span className="text-warning inline-flex items-center gap-1 text-xs">
              <Timer className="h-3 w-3" aria-hidden />
              {t('daysLeft', {
                n: campaign.daysLeft,
                count: formatNumber(campaign.daysLeft, locale),
              })}
            </span>
          )}
        </div>
      </div>

      {campaign.rejectionReason && (
        <p className="rounded-control bg-danger-bg text-danger p-2 text-xs">
          {t('rejectedBecause', { reason: campaign.rejectionReason })}
        </p>
      )}

      {(campaign.status === 'active' || campaign.status === 'ended') && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" aria-hidden />
            <bdi>{t('impressions', { count: formatNumber(campaign.impressions, locale) })}</bdi>
          </span>
          <span className="inline-flex items-center gap-1">
            <MousePointerClick className="h-3 w-3" aria-hidden />
            {/* CLICKS ARE PEOPLE WHO ARRIVED, and this line now says so in
                those words — «۲۴ کلیک» is a metric, «۲۴ مشتری از این تبلیغ
                آمدند» is a result (Prompt C15). */}
            <bdi>
              {t('visitors', {
                n: campaign.clicks,
                count: formatNumber(campaign.clicks, locale),
              })}
            </bdi>
          </span>
          {/*
            The percentage is its OWN isolate. «نرخ کلیک ٪۲» rendered as
            «٪نرخ کلیک ۲» — fa-AF puts the sign before the digits, and inside a
            longer RTL run the sign resolved against the wrong neighbour.
          */}
          <span className="inline-flex items-center gap-1">
            {t('ctrLabel')}
            <bdi className="tabular-nums">{formatPercent(ctr, locale)}</bdi>
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Renew continues from where the current run ends, so placement never gaps. */}
        {(campaign.status === 'active' || campaign.status === 'ended') && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await renewCampaign(campaign.id, 2);
                if (!result.ok) toast.error(t(`errors.${result.error}` as never));
                else {
                  toast.success(t('renewed'));
                  router.refresh();
                }
              })
            }
          >
            <RefreshCw />
            {/* A campaign that is still running is EXTENDED; one that has
                finished is BOOKED AGAIN. «تمدید» on an ended card reads as if
                the placement were still there to extend (Prompt C15). */}
            {campaign.status === 'ended' ? t('bookAgain') : t('renew')}
          </Button>
        )}

        {campaign.status === 'requested' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            className="hover:text-danger text-neutral-600"
            onClick={() =>
              startTransition(async () => {
                const result = await cancelCampaignRequest(campaign.id);
                if (!result.ok) toast.error(t(`errors.${result.error}` as never));
                else {
                  toast.success(t('withdrawn'));
                  router.refresh();
                }
              })
            }
          >
            <Trash2 />
            {t('withdraw')}
          </Button>
        )}
      </div>
    </li>
  );
}
