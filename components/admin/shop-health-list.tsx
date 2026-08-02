import { getLocale, getTranslations } from 'next-intl/server';
import { HeartPulse } from 'lucide-react';

import { NudgeShopButton } from '@/components/admin/nudge-shop-button';
import { EmptyState } from '@/components/custom/empty-state';
import { pickLocale } from '@/lib/db/localized';
import { shopHealth, type HealthFlag } from '@/lib/db/queries/mall';
import { formatDate, formatNumber, formatPercent, formatRating, formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/** Red is a shop turning business away; amber is a shop being slow about it. */
const FLAG_TONE: Record<HealthFlag, string> = {
  slow_acceptance: 'bg-accent-warm/15 text-neutral-800',
  high_rejection: 'bg-danger-bg text-danger',
  falling_rating: 'bg-accent-warm/15 text-neutral-800',
  no_products: 'bg-neutral-100 text-neutral-700',
  verification_expired: 'bg-neutral-100 text-neutral-700',
};

/**
 * Shop health (Prompt C9).
 *
 * A LANDLORD'S LIST, NOT A MODERATOR'S. Nothing flagged here is a rule
 * violation and nothing here has a punishment attached — these are tenants
 * costing the mall its reputation with shoppers in ways they can fix, and the
 * only action offered is to tell them.
 *
 * EVERY FLAG CARRIES ITS EVIDENCE on the same line. "Slow to accept" is an
 * accusation; "slow to accept — median 19 hours over 24 orders" is a fact the
 * shopkeeper can be shown, which is what makes the phone call possible.
 *
 * AN EMPTY LIST IS THE GOOD OUTCOME, and it says so. A generic "no results"
 * here would read as a broken filter on a screen whose whole purpose is to be
 * empty most of the time.
 */
export async function ShopHealthList({ days }: { days: number }) {
  const locale = await getLocale();
  const t = await getTranslations('adminShops.health');

  const shops = await shopHealth(days);

  if (shops.length === 0) {
    return (
      <EmptyState
        illustration={<HeartPulse className="h-7 w-7" aria-hidden />}
        title={t('allWellTitle')}
        description={t('allWellBody', { days: formatNumber(days, locale) })}
      />
    );
  }

  const evidence = (shop: (typeof shops)[number], flag: HealthFlag): string => {
    switch (flag) {
      case 'slow_acceptance':
        return t('evidence.slow_acceptance', {
          hours: formatNumber(Math.round(shop.medianAcceptHours ?? 0), locale),
          orders: formatNumber(shop.ordersInWindow, locale),
        });
      case 'high_rejection':
        return t('evidence.high_rejection', {
          rate: formatPercent(shop.rejectionRate, locale),
          orders: formatNumber(shop.ordersInWindow, locale),
        });
      case 'falling_rating':
        return t('evidence.falling_rating', {
          from: formatRating(shop.ratingEarlier ?? 0, locale),
          to: formatRating(shop.ratingRecent ?? 0, locale),
        });
      case 'no_products':
        return t('evidence.no_products');
      case 'verification_expired':
        return t('evidence.verification_expired');
    }
  };

  return (
    <ul className="space-y-2" data-health-list>
      {shops.map((shop) => (
        <li
          key={shop.id}
          data-health-flags={shop.flags.length}
          className="rounded-card border-border bg-card space-y-2.5 border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/admin/shops/${shop.id}`}
                className="hover:text-primary text-sm font-bold"
              >
                {pickLocale(shop.name, locale)}
              </Link>
              {shop.floor !== null && (
                <p className="text-muted-foreground text-xs">
                  {t('floorUnit', {
                    floor: formatNumber(shop.floor, locale),
                    unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                  })}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/*
                VACATION MODE, ANNOUNCED BEFORE THE PHONE CALL. The shopkeeper
                set `pausedUntil` themselves; a nudge about slow acceptance to a
                tenant who told the mall they would be shut is the landlord not
                having read their own notice board.
              */}
              {shop.paused && shop.pausedUntil && (
                <span className="rounded-control bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
                  {t('pausedUntil', { date: formatDate(shop.pausedUntil, locale, 'medium') })}
                </span>
              )}

              {/* The landlord's move: they cannot fix the shop's queue for them
                  — that would put management inside a tenant's transaction
                  (PRD §3.1) — but they can make sure the tenant knows. */}
              <NudgeShopButton shopId={shop.id} flags={shop.flags} />
            </div>
          </div>

          <ul className="space-y-1.5">
            {shop.flags.map((flag) => (
              <li key={flag} className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    'rounded-control shrink-0 px-2 py-0.5 font-semibold',
                    FLAG_TONE[flag],
                  )}
                >
                  {t(`flags.${flag}` as never)}
                </span>
                <span className="text-muted-foreground">{evidence(shop, flag)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
