import { getTranslations } from 'next-intl/server';

import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import {
  ProductGrid,
  ProductGridSkeleton,
  type ProductGridItem,
} from '@/components/shop/product-grid';
import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { activeOffers } from '@/lib/db/queries/home';

/**
 * "Today's best deals" (PRD §5.1) — the mockup's flash band, the one section on
 * the page with a live clock in its heading.
 *
 * The countdown is pinned to the SOONEST-ending live offer, not to an invented
 * midnight deadline: the number has to mean something, and every one of these
 * discounts really does expire when that offer does. With no live offer the
 * heading simply loses its clock and the deals still render, because the
 * discounted prices are on the products themselves.
 */
export async function DealsRail({
  items,
  savedIds,
}: {
  /**
   * Supplied by the page rather than queried here.
   *
   * The home page assembles every product-bearing band in one pass so nothing
   * appears twice down the scroll; a band that fetches for itself cannot know
   * what the band above it already took (lib/db/queries/home.ts).
   */
  items: ProductGridItem[];
  savedIds: Set<string>;
}) {
  const t = await getTranslations('home');
  const offers = await activeOffers(1);

  if (items.length === 0) return null;

  const soonest = offers[0] ?? null;

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('dealsToday')}
        href="/offers"
        adornment={
          soonest ? (
            /*
             * No "ends in" prefix: OfferCountdown already renders "۳ روز باقی
             * مانده" once the deadline is more than a day out, and the two
             * together read "ends in 3 days remaining". Its timer icon carries
             * the meaning at every range.
             */
            <span className="rounded-pill bg-danger-bg flex items-center px-3 py-1.5">
              <OfferCountdown
                endsAt={soonest.endsAt.toISOString()}
                className="text-danger font-semibold"
              />
            </span>
          ) : undefined
        }
      />
      <ProductGrid
        items={items}
        savedIds={savedIds}
        layout="row"
        railLabel={t('dealsToday')}
        priority
      />
    </section>
  );
}

export function DealsRailSkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeaderSkeleton />
      <ProductGridSkeleton count={8} layout="row" />
    </section>
  );
}
