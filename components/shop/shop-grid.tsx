import { getLocale } from 'next-intl/server';

import { ShopCard, ShopCardSkeleton } from '@/components/custom/shop-card';
import { pickLocale } from '@/lib/db/localized';
import { pauseState } from '@/lib/pause';
import type { LocalizedText } from '@/lib/db/schema';

export type ShopGridItem = {
  id: string;
  slug: string;
  name: LocalizedText;
  categoryName?: LocalizedText | null;
  rating?: number;
  reviewCount?: number;
  productCount?: number;
  floor: number | null;
  unitNumber: string | null;
  logoPath: string | null;
  bannerPath: string | null;
  /** When the mall verified the shop, or null (Prompt C7). */
  verifiedAt?: Date | null;
  /** Vacation mode; only rendered when the caller also supplies `now`. */
  pausedUntil?: Date | null;
  sponsored?: boolean;
};

/**
 * Shared shop card grid for the directory, the featured strip and search
 * results.
 *
 * `featured` is three across where the organic grid is four, which is the whole
 * visual difference between a paid placement and an organic one — beyond the
 * badge, which says it, the size is what makes it worth buying (PRD §8.2).
 */
export async function ShopGrid({
  items,
  columns = 'organic',
  layout = 'card',
  hideFloor = false,
  now,
}: {
  items: ShopGridItem[];
  columns?: 'organic' | 'featured';
  /**
   * `row` is ShopCard's compact form — monogram, name, one metadata line.
   *
   * The directory uses it because it groups by FLOOR, and a floor heading over
   * four banner-and-logo cards buries the heading under the photography it was
   * meant to organise. A row states the same four facts in a quarter of the
   * height, so a whole floor fits in one glance and the three floors read as
   * three floors rather than as twelve cards.
   */
  layout?: 'card' | 'row';
  /** Set when a floor heading already states it — see ShopCard's `hideFloor`. */
  hideFloor?: boolean;
  /**
   * The server's clock, for the vacation-mode chip.
   *
   * OPTIONAL, and deliberately without a `new Date()` default: a default would
   * be an impure call during render (React 19, CLAUDE.md), and the surfaces that
   * do not select `pausedUntil` have nothing to decide anyway. A caller that
   * wants the chip passes both.
   */
  now?: Date;
}) {
  const locale = await getLocale();

  return (
    <div
      className={
        layout === 'row'
          ? 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3'
          : columns === 'featured'
            ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
            : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
      }
    >
      {items.map((shop) => {
        // Decided HERE, on the server, so the card never reads a clock.
        const paused = now ? pauseState(shop.pausedUntil, now) : null;

        return (
          <ShopCard
            key={shop.id}
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
            verifiedAt={shop.verifiedAt ? shop.verifiedAt.toISOString() : null}
            pausedUntil={paused?.paused ? paused.until.toISOString() : null}
            isSponsored={shop.sponsored}
            layout={layout}
            hideFloor={hideFloor}
          />
        );
      })}
    </div>
  );
}

export function ShopGridSkeleton({
  count = 8,
  layout = 'card',
}: {
  count?: number;
  layout?: 'card' | 'row';
}) {
  return (
    <div
      className={
        layout === 'row'
          ? 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3'
          : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
      }
    >
      {Array.from({ length: count }, (_, index) => (
        <ShopCardSkeleton key={index} layout={layout} />
      ))}
    </div>
  );
}
