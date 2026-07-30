import { getLocale, getTranslations } from 'next-intl/server';

import { ProductGrid, type ProductGridItem } from '@/components/shop/product-grid';
import { RecentlyViewedRail } from '@/components/shop/product/recently-viewed-rail';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { promotedProductsForSlot } from '@/lib/db/queries/listing';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { moreFromShop, similarFromOtherShops, type RailProduct } from '@/lib/db/queries/rails';
import type { LocalizedText } from '@/lib/db/schema';

/** A rail with fewer than this does not render — a stub reads as an empty shop. */
const MIN_RAIL_ITEMS = 4;

/**
 * The product page's three discovery rails (Prompt P5).
 *
 * One "related products" rail became three with genuinely different logic:
 *
 * 1. MORE FROM THIS SHOP — the mall's whole point. You are buying from a real
 *    shop on the second floor that also sells these other things.
 * 2. SIMILAR PRODUCTS — same category, OTHER shops, nearest price. The
 *    marketplace claim: see what the shop next door charges.
 * 3. RECENTLY VIEWED — the reader's own trail, from the browser.
 *
 * THREE, not four. Best Buy runs four because they have millions of SKUs; with
 * seventy-five products a fourth rail shows the same thing twice and makes the
 * catalogue feel smaller.
 *
 * CROSS-RAIL DEDUPE, resolved top-down: a product appears in at most one rail,
 * and the current product in none. Without it "more from this shop" and
 * "similar products" overlap on every product in a single-shop category, and
 * the page reads as three copies of one rail.
 */
export async function ProductRails({
  productId,
  shopId,
  categoryId,
  price,
}: {
  productId: string;
  shopId: string;
  categoryId: string | null;
  price: number;
}) {
  const t = await getTranslations('product.rails');
  const locale = await getLocale();

  const [shopItems, similarItems, user] = await Promise.all([
    moreFromShop(shopId, productId),
    similarFromOtherShops(productId, categoryId, shopId, price),
    currentUser(),
  ]);

  /*
   * PAID PLACEMENT, INTERSECTED WITH RELEVANCE (the bug this prompt names).
   *
   * The related rail used to ask for `product_related` campaigns with nothing
   * but the current product excluded, so a Digital Sport Watch appeared —
   * badged Sponsored — on a school-shoes page. A paid slot buys POSITION AMONG
   * RELEVANT ITEMS, never an appearance among irrelevant ones.
   *
   * THE RAIL'S CANDIDATE SET IS THE DEFINITION OF RELEVANT, and it is the only
   * one — a second category filter on the query would be a second definition,
   * and the two would drift the first time either rail changed its radius. A
   * campaign that matches nothing here simply does not appear, and the rail
   * renders without a sponsored entry.
   */
  const promoted = categoryId
    ? await promotedProductsForSlot('product_related', { excludeProductId: productId })
    : [];

  const similarIds = new Set(similarItems.map((item) => item.id));
  const relevantPromoted = promoted.filter((item) => similarIds.has(item.id));

  const seen = new Set<string>([productId]);
  const take = (rows: RailProduct[]): ProductGridItem[] => {
    const items: ProductGridItem[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      items.push(toGridItem(row));
    }
    return items;
  };

  // Order matters: the shop rail claims its products first, so the similar rail
  // never repeats one of them.
  const shopRail = take(shopItems);
  const promotedRail = relevantPromoted
    .filter((item) => !seen.has(item.id))
    .map((item) => {
      seen.add(item.id);
      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        price: item.price,
        discountPrice: item.discountPrice,
        stock: item.stock,
        shopName: item.shopName,
        shopFloor: item.shopFloor,
        imagePath: item.imagePath,
        rating: item.rating,
        reviewCount: item.reviewCount,
        sponsored: true,
      } satisfies ProductGridItem;
    });
  const similarRail = [...promotedRail, ...take(similarItems)];

  // Counted only for placements that actually made it onto the page — an
  // impression for a card nobody could see is a number that overstates what the
  // shop bought.
  const shownPromoted = new Set(promotedRail.map((item) => item.id));
  void recordImpressions(
    relevantPromoted.filter((item) => shownPromoted.has(item.id)).map((item) => item.campaignId),
  );

  const rails = [
    { key: 'shop', label: t('moreFromShop'), items: shopRail },
    { key: 'similar', label: t('similar'), items: similarRail },
  ].filter((rail) => rail.items.length >= MIN_RAIL_ITEMS);

  const saved = await wishlistedProductIds(
    user?.id,
    rails.flatMap((rail) => rail.items.map((item) => item.id)),
  );

  return (
    <div className="mt-10 space-y-10">
      {rails.map((rail) => (
        <section key={rail.key} className="space-y-3">
          <h2 className="text-foreground text-xl font-bold">{rail.label}</h2>
          <ProductGrid
            items={rail.items}
            savedIds={saved}
            layout="row"
            quickAdd
            railLabel={rail.label}
          />
        </section>
      ))}

      {/*
        The third rail is a CLIENT component: its list is localStorage, which
        only the browser has. It renders nothing until it has three entries, so
        a first-time visitor never sees a stub — and it excludes everything the
        two server rails already used, which it cannot know without being told.
      */}
      <RecentlyViewedRail
        currentProductId={productId}
        excludeIds={[...seen]}
        locale={locale}
        heading={t('recentlyViewed')}
      />
    </div>
  );
}

function toGridItem(row: RailProduct): ProductGridItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title as LocalizedText,
    price: row.price,
    discountPrice: row.discountPrice,
    stock: row.stock,
    shopName: row.shopName as LocalizedText,
    shopFloor: row.shopFloor,
    imagePath: row.imagePath,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  };
}
