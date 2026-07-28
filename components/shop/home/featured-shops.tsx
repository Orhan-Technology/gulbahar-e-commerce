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
    <section className="space-y-5">
      <SectionHeader title={t('featuredShops')} href="/shops" />

      {/* Compact rows, four across: eight shop banners here would have competed
          with the product photography in the rails above and below. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shops.map((shop) => (
          <div key={shop.id}>
            <ShopCard
              layout="row"
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
    <section className="space-y-5">
      <SectionHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index}>
            <ShopCardSkeleton layout="row" />
          </div>
        ))}
      </div>
    </section>
  );
}
