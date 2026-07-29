import { getLocale, getTranslations } from 'next-intl/server';
import { Megaphone } from 'lucide-react';

import { ShopCard, ShopCardSkeleton } from '@/components/custom/shop-card';
import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import { pressable } from '@/components/motion/pressable';
import { Rail } from '@/components/shop/rail';
import { pickLocale } from '@/lib/db/localized';
import { featuredShops } from '@/lib/db/queries/home';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Featured shops (PRD §5.1, §8.2) — the client's revenue product on the page.
 *
 * It used to render as compact monogram ROWS, four across, on the grounds that
 * eight banners would compete with the product photography above and below.
 * That reasoning was right about the visual problem and wrong about the answer:
 * this is the module the mall SELLS, and making it the quietest thing on the
 * page is the opposite of what it is for. As a rail it can be the richest
 * module — full banner cards — without occupying more of the page than a row.
 *
 * Paid placements come first with a Sponsored badge, capped by the slot's
 * capacity, then organic top-rated shops fill the rest. That ordering is the
 * guardrail from PRD §8.4 made visible: a shop can buy the front of the
 * carousel, but the organic tail is still ranked purely on rating.
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

      <Rail label={t('featuredShops')}>
        {shops.map((shop) => (
          <div key={shop.id}>
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

        {/*
         * The trailing ghost card advertises the slot itself.
         *
         * Shown to EVERYONE, not only to shopkeepers. A mall tenant browsing the
         * storefront as a customer is exactly who should see that this position
         * is for sale — and gating it on a role would hide it from the person
         * most likely to buy, who is signed out on their own phone.
         */}
        <div>
          <Link
            // /dashboard/promotions: signed out this lands on sign-in and then
            // here, which is the correct funnel for a prospective tenant. There
            // is no public promotions explainer to point at, and inventing one
            // would be a page with nothing on it but this link's destination.
            href="/dashboard/promotions"
            className={cn(
              pressable,
              'rounded-card border-border text-muted-foreground hover:border-primary hover:text-primary flex h-full min-h-[220px] flex-col items-center justify-center gap-2 border border-dashed p-4 text-center transition-[color,border-color,scale] duration-150 ease-out',
            )}
          >
            <Megaphone className="h-6 w-6" aria-hidden />
            <span className="text-sm font-semibold">{t('yourShopHere')}</span>
            <span className="text-xs">{t('yourShopHereHint')}</span>
          </Link>
        </div>
      </Rail>
    </section>
  );
}

export function FeaturedShopsSkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeaderSkeleton />
      <div className="-mx-4 flex scrollbar-none gap-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&>*]:w-[44%] [&>*]:shrink-0 sm:[&>*]:w-[30%] lg:[&>*]:w-[18.5%]">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}>
            <ShopCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}
