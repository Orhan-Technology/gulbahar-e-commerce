import { getLocale, getTranslations } from 'next-intl/server';

import { ShopCard, ShopCardSkeleton } from '@/components/custom/shop-card';
import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import { pickLocale } from '@/lib/db/localized';
import { featuredShops } from '@/lib/db/queries/home';
import { recordImpressions } from '@/lib/db/queries/promoted';

/**
 * Featured shops carousel (PRD §5.1).
 *
 * Paid placements come first with a Sponsored badge, capped by the slot's
 * capacity, then organic top-rated shops fill the rest. That ordering is the
 * guardrail from PRD §8.4 made visible: a shop can buy the front of the carousel,
 * but the organic tail is still ranked purely on rating.
 */
export async function FeaturedShops() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const shops = await featuredShops(8);

  if (shops.length === 0) return null;

  const campaignIds = shops
    .map((shop) => shop.campaignId)
    .filter((id): id is string => typeof id === 'string');
  void recordImpressions(campaignIds);

  return (
    <section className="space-y-3">
      <SectionHeader title={t('featuredShops')} href="/shops" />

      <div className="-mx-4 flex snap-x snap-mandatory scrollbar-none gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
        {shops.map((shop) => (
          <div key={shop.id} className="w-64 shrink-0 snap-start sm:w-auto">
            <ShopCard
              slug={shop.slug}
              name={pickLocale(shop.name, locale)}
              categoryName={shop.categoryName ? pickLocale(shop.categoryName, locale) : undefined}
              rating={shop.rating}
              reviewCount={shop.reviewCount}
              productCount={shop.productCount}
              floor={shop.floor}
              unitNumber={shop.unitNumber}
              logoPath={shop.logoPath}
              bannerPath={shop.bannerPath}
              isSponsored={shop.sponsored}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function FeaturedShopsSkeleton() {
  return (
    <section className="space-y-3">
      <SectionHeaderSkeleton />
      <div className="-mx-4 flex scrollbar-none gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="w-64 shrink-0 sm:w-auto">
            <ShopCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}
