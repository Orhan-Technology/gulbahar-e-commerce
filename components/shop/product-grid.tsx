import { getLocale } from 'next-intl/server';

import { ProductCard, ProductCardSkeleton } from '@/components/custom/product-card';
import { WishlistButton } from '@/components/shop/wishlist-button';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

export type ProductGridItem = {
  id: string;
  slug: string;
  title: LocalizedText;
  price: number;
  discountPrice: number | null;
  stock: number;
  shopName: LocalizedText;
  /** Floor the shop trades on, rendered after its name (PRD §5.1). */
  shopFloor?: number | null;
  imagePath: string | null;
  rating?: number;
  reviewCount?: number;
  /** Set for paid placements so the card carries a Sponsored badge (PRD §8.4). */
  sponsored?: boolean;
};

export type ProductGridProps = {
  items: ProductGridItem[];
  /** Product ids the viewer has already wishlisted. */
  savedIds?: Set<string>;
  /** Horizontal scroller for home rows; responsive grid for listings. */
  layout?: 'grid' | 'row';
  /** True for the first row on a page, so its images are not lazy-loaded. */
  priority?: boolean;
  className?: string;
};

/**
 * Renders product cards from query results.
 *
 * ProductCard owns its own heart for the styleguide's benefit, but on the real
 * storefront the heart has to talk to a server action and know the viewer's saved
 * state — so this passes a wired WishlistButton in and hides the built-in one.
 */
export async function ProductGrid({
  items,
  savedIds,
  layout = 'grid',
  priority = false,
  className,
}: ProductGridProps) {
  const locale = await getLocale();

  return (
    <div
      className={cn(
        layout === 'row'
          ? '-mx-4 flex snap-x snap-mandatory scrollbar-none gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:px-0 lg:grid-cols-5'
          : 'grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4',
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn('relative', layout === 'row' && 'w-40 shrink-0 snap-start sm:w-auto')}
        >
          <ProductCard
            slug={item.slug}
            title={pickLocale(item.title, locale)}
            shopName={pickLocale(item.shopName, locale)}
            shopFloor={item.shopFloor}
            price={item.price}
            discountPrice={item.discountPrice}
            rating={item.rating}
            reviewCount={item.reviewCount}
            imagePath={item.imagePath}
            stock={item.stock}
            isSponsored={item.sponsored}
            priority={priority && index < 4}
            // Outermost cards grow inwards so the pop-out is never clipped by
            // the page edge.
            edge={index === 0 ? 'start' : index === items.length - 1 ? 'end' : undefined}
            /*
             * Passed IN rather than overlaid on top. The media panel scales on
             * hover, and a heart positioned over the card from outside stays
             * where it was while the panel grows away from underneath it.
             */
            wishlistSlot={
              <WishlistButton productId={item.id} initialSaved={savedIds?.has(item.id) ?? false} />
            }
          />
        </div>
      ))}
    </div>
  );
}

export function ProductGridSkeleton({
  count = 8,
  layout = 'grid',
}: {
  count?: number;
  layout?: 'grid' | 'row';
}) {
  return (
    <div
      className={
        layout === 'row'
          ? '-mx-4 flex scrollbar-none gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:px-0 lg:grid-cols-5'
          : 'grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4'
      }
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={layout === 'row' ? 'w-40 shrink-0 sm:w-auto' : undefined}>
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  );
}
