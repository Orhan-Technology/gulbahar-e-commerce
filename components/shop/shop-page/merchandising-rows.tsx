import { getTranslations } from 'next-intl/server';

import { SectionHeader } from '@/components/custom/section-header';
import { ProductGrid, type ProductGridItem } from '@/components/shop/product-grid';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import {
  MIN_ROW_ITEMS,
  shopNewArrivals,
  shopTopSellers,
  shopTrending,
} from '@/lib/db/queries/shop-page';

const ROW_SIZE = 8;

/**
 * The merchandising rows above a shop's catalogue (Prompt C8).
 *
 * WHAT SELLS · WHAT PEOPLE ARE LOOKING AT · WHAT IS NEW. Three genuinely
 * different questions asked of the same catalogue — units fulfilled, views this
 * week, created_at — so a shop with sixty products has three ways in rather
 * than one grid sorted by relevance.
 *
 * NO CROSS-ROW DEDUPE, unlike the product page's rails. There the three rails
 * all answered one question (what else might you want) and an overlap made them
 * read as one rail printed three times. Here the overlap is the INFORMATION: a
 * product that is both the best seller and the most viewed is the shop's hero,
 * and hiding it from the second row to keep the sets disjoint would misreport
 * both.
 *
 * A ROW WITH FEWER THAN FOUR ITEMS DOES NOT RENDER, and neither does any row on
 * a catalogue small enough that a rail would simply BE the catalogue. Both are
 * the same rule seen from two ends: a rail is a selection, and a "best sellers"
 * rail carrying every product a shop owns does not say these four are the good
 * ones, it says the shop has four products. Most seeded shops carry five or six
 * items and correctly show no rows at all — the grid below already shows them
 * everything, twice would be padding.
 */
export async function MerchandisingRows({
  shopId,
  productCount,
}: {
  shopId: string;
  /** Published products in this shop — the gate described above. */
  productCount: number;
}) {
  const t = await getTranslations('shopPage.rows');

  if (productCount < MIN_ROW_ITEMS * 2) return null;

  const [topSellers, trending, newArrivals, user] = await Promise.all([
    shopTopSellers(shopId, ROW_SIZE),
    shopTrending(shopId, ROW_SIZE),
    shopNewArrivals(shopId, ROW_SIZE),
    currentUser(),
  ]);

  const enough = (items: ProductGridItem[]) => (items.length >= MIN_ROW_ITEMS ? items : null);

  const rows = [
    { key: 'topSellers', items: enough(topSellers) },
    { key: 'trending', items: enough(trending) },
    { key: 'newArrivals', items: enough(newArrivals) },
  ].filter((row): row is { key: string; items: ProductGridItem[] } => row.items !== null);

  if (rows.length === 0) return null;

  const savedIds = user?.id
    ? await wishlistedProductIds(
        user.id,
        rows.flatMap((row) => row.items.map((item) => item.id)),
      )
    : new Set<string>();

  return (
    <div className="space-y-8">
      {rows.map((row, index) => (
        <section
          key={row.key}
          // The check script reads these to prove the four-item floor holds
          // without having to count cards in the HTML (scripts/check-shop.ts).
          data-shop-row={row.key}
          data-row-items={row.items.length}
          className="space-y-3"
        >
          <SectionHeader title={t(`${row.key}.title` as never)} />
          <p className="text-muted-foreground -mt-2 text-xs">{t(`${row.key}.hint` as never)}</p>
          <ProductGrid
            items={row.items}
            savedIds={savedIds}
            layout="row"
            railLabel={t(`${row.key}.title` as never)}
            priority={index === 0}
            quickAdd
          />
        </section>
      ))}
    </div>
  );
}
