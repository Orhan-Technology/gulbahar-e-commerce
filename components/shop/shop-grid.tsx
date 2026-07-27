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

/** Shared shop card grid for the directory and search results. */
export async function ShopGrid({ items }: { items: ShopGridItem[] }) {
  const locale = await getLocale();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

export function ShopGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <ShopCardSkeleton key={index} />
      ))}
    </div>
  );
}
