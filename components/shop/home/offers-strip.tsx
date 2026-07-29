import { getLocale, getTranslations } from 'next-intl/server';
import { Tag } from 'lucide-react';

import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { formatCurrency, formatPercent } from '@/lib/format';
import { pickLocale } from '@/lib/db/localized';
import { activeOffers } from '@/lib/db/queries/home';
import { Rail } from '@/components/shop/rail';
import { Link } from '@/lib/i18n/navigation';

/**
 * Active offers strip (PRD §5.1). Shop-funded discounts, distinct from paid
 * placement — these carry no Sponsored badge because the shop is giving up margin,
 * not buying position (PRD §8.1 vs §8.2).
 */
export async function OffersStrip() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const offers = await activeOffers(8);

  if (offers.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeader title={t('activeOffers')} href="/offers" />

      <Rail label={t('activeOffers')} size="panel">
        {offers.map((offer) => (
          <Link
            key={offer.id}
            href={`/shops/${offer.shopSlug}`}
            className="pressable rounded-card border-accent-200 bg-accent-50 shadow-card hover:shadow-overlay flex flex-col gap-2 border p-3 transition-[box-shadow,scale] duration-150 ease-out"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-control bg-accent-100 text-accent-800 flex h-8 w-8 items-center justify-center">
                <Tag className="h-4 w-4" aria-hidden />
              </span>
              <span className="rounded-pill bg-accent text-accent-foreground px-2 py-0.5 text-xs font-bold">
                {offer.type === 'percent'
                  ? formatPercent(offer.value / 100, locale)
                  : formatCurrency(offer.value, locale)}
              </span>
            </div>

            <h3 className="clamp-1 text-accent-900 text-sm font-semibold">
              {pickLocale(offer.name, locale)}
            </h3>
            <p className="clamp-1 text-accent-800/80 text-xs">
              {pickLocale(offer.shopName, locale)}
            </p>

            <OfferCountdown
              endsAt={offer.endsAt.toISOString()}
              className="text-accent-800 mt-auto"
            />
          </Link>
        ))}
      </Rail>
    </section>
  );
}

export function OffersStripSkeleton() {
  return (
    <section className="space-y-3">
      <SectionHeaderSkeleton />
      <div className="-mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&>*]:w-[82%] [&>*]:shrink-0 sm:[&>*]:w-[46%] lg:[&>*]:w-[31%]">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-card border-border bg-card flex w-56 shrink-0 flex-col gap-2 border p-3"
          >
            <div className="flex justify-between">
              <Skeleton className="rounded-control h-8 w-8" />
              <Skeleton className="rounded-pill h-5 w-12" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
