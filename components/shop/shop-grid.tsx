import { getLocale } from 'next-intl/server';

import { ShopCard, ShopCardSkeleton } from '@/components/custom/shop-card';
import { pickLocale } from '@/lib/db/localized';
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
}: {
  items: ShopGridItem[];
  columns?: 'organic' | 'featured';
}) {
  const locale = await getLocale();

  return (
    <div
      className={
        columns === 'featured'
          ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
          : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
      }
    >
      {items.map((shop) => (
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
          isSponsored={shop.sponsored}
        />
      ))}
    </div>
  );
}

export function ShopGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <ShopCardSkeleton key={index} />
      ))}
    </div>
  );
}
