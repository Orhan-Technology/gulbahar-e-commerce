import { getLocale, getTranslations } from 'next-intl/server';

import { SectionHeader } from '@/components/custom/section-header';
import { ProductGrid } from '@/components/shop/product-grid';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { trendingProducts } from '@/lib/db/queries/products';

/**
 * What to look at when this listing has nothing (PRD §5.2).
 *
 * A DEAD END IS THE ONE PLACE A LISTING OWES THE READER SOMEWHERE TO GO, and
 * the honest offer is the same wherever they hit it: the things other people
 * are actually looking at. It lived inside the search page as a private
 * function, which is why an empty CATEGORY — the other screen that regularly
 * renders nothing — ended at an illustration, a button, and eight hundred
 * pixels of white.
 *
 * A RAIL, not a grid, when it sits under an empty state: this band is a
 * consolation rather than the page's subject, and ten cards in a scroller offer
 * the same choice without giving the failure case three screens of height. The
 * empty /search page, whose subject IS "what should I look at", asks for the
 * grid.
 *
 * Usually rendered as an ELEMENT passed into ProductListing's `emptyExtra`, so
 * React never mounts it when there are results and none of these queries run on
 * the happy path.
 */
export async function PopularFallback({
  heading,
  layout = 'row',
}: {
  /** Defaults to the search page's own heading, which is the general one. */
  heading?: string;
  layout?: 'grid' | 'row';
}) {
  const locale = await getLocale();
  const t = await getTranslations('search');
  const title = heading ?? t('popularTitle');

  const [items, user] = await Promise.all([trendingProducts(locale, 10), currentUser()]);
  // Nothing to fall back TO is possible on a freshly reset database, and a
  // heading over an empty row is a second thing gone wrong on this screen.
  if (items.length === 0) return null;

  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  return (
    <section className="space-y-3">
      <SectionHeader title={title} href="/products" />
      <ProductGrid items={items} savedIds={saved} layout={layout} railLabel={title} />
    </section>
  );
}
