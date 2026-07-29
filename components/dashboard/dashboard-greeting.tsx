import { getLocale, getTranslations } from 'next-intl/server';
import { CircleDashed, ShieldCheck } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { shopById } from '@/lib/db/queries/shops';
import { formatUnitNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The one warm line on the dashboard (PRD §6.1).
 *
 * Small on purpose. It exists to say WHOSE screen this is and whether the shop
 * is live yet — the two facts a shopkeeper checks without reading — and then to
 * get out of the way of the queue directly beneath it. Anything more here is
 * vertical space taken from the only thing on the page that is work.
 *
 * The status pill is not decoration: a pending shop's products are invisible on
 * the storefront (PRD §7.1), so a tenant who does not know they are still
 * pending will read an empty sales figure as a broken marketplace.
 */
export async function DashboardGreeting({ name, shopId }: { name: string; shopId: string }) {
  const locale = await getLocale();
  const t = await getTranslations('dashboard');
  const nav = await getTranslations('dashboardNav');
  const common = await getTranslations('common');

  const shop = await shopById(shopId);
  const approved = shop?.status === 'approved';

  const where = shop
    ? [
        shop.floor !== null ? common('floorName', { floor: shop.floor }) : null,
        shop.unitNumber ? nav('unit', { number: formatUnitNumber(shop.unitNumber, locale) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1 className="text-xl font-bold">{t('greeting', { name: name.split(' ')[0] })}</h1>

      {shop && (
        <p className="text-sm text-neutral-500">
          {pickLocale(shop.name, locale)}
          {where && ` · ${where}`}
        </p>
      )}

      <span
        className={cn(
          'rounded-pill ms-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-2xs font-bold',
          approved ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning',
        )}
      >
        {approved ? (
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <CircleDashed className="h-3.5 w-3.5" aria-hidden />
        )}
        {nav(`shopStatus.${shop?.status ?? 'pending'}`)}
      </span>
    </div>
  );
}

export function DashboardGreetingSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="rounded-pill ms-auto h-6 w-20" />
    </div>
  );
}
