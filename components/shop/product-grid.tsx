import { getLocale } from 'next-intl/server';

import { ProductCard, ProductCardSkeleton } from '@/components/custom/product-card';
import { QuickAddButton } from '@/components/shop/quick-add-button';
import { Rail } from '@/components/shop/rail';
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
  /**
   * `grid` is the listing layout. `row` is a RAIL — a real horizontal
   * scroller at every breakpoint, with peek, snap and desktop arrows.
   *
   * It used to become a five-column grid above `sm`, which is where the
   * sixth product went: nowhere. See components/shop/rail.tsx.
   */
  layout?: 'grid' | 'row';
  /** Names the rail's region for screen readers. Required when layout='row'. */
  railLabel?: string;
  /** True for the first row on a page, so its images are not lazy-loaded. */
  priority?: boolean;
  /**
   * Adds a one-tap add-to-cart to each card (Prompt P5).
   *
   * On the RAILS, where the product is already decided and the shopper is
   * browsing rather than researching. Off in the listing grid, where the job is
   * comparing and an extra control on every one of twenty-four cards is noise.
   */
  quickAdd?: boolean;
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
  railLabel,
  priority = false,
  quickAdd = false,
  className,
}: ProductGridProps) {
  const locale = await getLocale();

  const cards = items.map((item, index) => (
    <div key={item.id} className="relative">
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
        /*
         * Passed IN rather than overlaid on top: the card owns where these sit,
         * the caller owns what they do — the heart needs the viewer's saved
         * state and the cart button needs an action and a toast.
         *
         * THE `key` ON EACH SLOT IS LOAD-BEARING, and it looks redundant —
         * neither element is in a list here. Both are CLIENT elements created
         * in a SERVER component and handed to a client component as props, so
         * they cross the RSC boundary through the flight stream with `key:
         * null`; ProductCard then renders them as siblings, React reconciles
         * that as an array of keyless children, and every card logs "Each child
         * in a list should have a unique key". It only fires when BOTH slots
         * are filled, which is why it showed up on rails (quickAdd) and not in
         * the listing grid — and it names ProductCard as the culprit while
         * pointing at a line in this file.
         */
        wishlistSlot={
          <WishlistButton
            key="wishlist"
            productId={item.id}
            initialSaved={savedIds?.has(item.id) ?? false}
          />
        }
        quickAddSlot={
          quickAdd ? (
            <QuickAddButton key="quick-add" productId={item.id} disabled={item.stock <= 0} />
          ) : undefined
        }
      />
    </div>
  ));

  if (layout === 'row') {
    return (
      <Rail label={railLabel ?? ''} className={className}>
        {cards}
      </Rail>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4', className)}>
      {cards}
    </div>
  );
}

export function ProductGridSkeleton({
  count = 8,
  layout = 'grid',
  /** Must carry the same column override the real grid gets, or the row count
      changes the moment the cards arrive and the page jumps. */
  className,
}: {
  count?: number;
  layout?: 'grid' | 'row';
  className?: string;
}) {
  return (
    <div
      className={cn(
        layout === 'row'
          ? // Matches the rail's own card widths exactly, so nothing shifts
            // sideways when the real cards arrive.
            '-mx-4 flex scrollbar-none gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&>*]:w-[44%] [&>*]:shrink-0 sm:[&>*]:w-[30%] lg:[&>*]:w-[18.5%]'
          : 'grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  );
}
