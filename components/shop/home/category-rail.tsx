import { getLocale, getTranslations } from 'next-intl/server';

import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import {
  ProductGrid,
  ProductGridSkeleton,
  type ProductGridItem,
} from '@/components/shop/product-grid';
import { pickLocale } from '@/lib/db/localized';
import { categoryBySlug } from '@/lib/db/queries/shops';

/**
 * One per-category bestseller rail (PRD §5.1) — the band the mockup repeats down
 * the page for tech, fashion, beauty, grocery and homeware.
 *
 * Renders NOTHING when the category has no publicly visible stock, rather than a
 * heading over an empty row. The food category is exactly that case until the
 * pending shop is approved on stage, and an empty rail would advertise the hole
 * the walkthrough is about to fill.
 */
export async function CategoryRail({
  slug,
  items,
  savedIds,
  priority = false,
}: {
  slug: string;
  /** Supplied by the page — see DealsRail for why the band does not query. */
  items: ProductGridItem[];
  savedIds: Set<string>;
  priority?: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const category = await categoryBySlug(slug);

  // Both must be present: an unknown slug is a coding mistake, not an empty
  // state, and rendering "Bestsellers in undefined" would hide it.
  if (items.length === 0 || !category) return null;


  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('bestsellersIn', { category: pickLocale(category.name, locale) })}
        href={`/categories/${slug}`}
      />
      <ProductGrid
        items={items}
        savedIds={savedIds}
        layout="row"
        railLabel={pickLocale(category.name, locale)}
        priority={priority}
      />
    </section>
  );
}

export function CategoryRailSkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeaderSkeleton />
      <ProductGridSkeleton count={8} layout="row" />
    </section>
  );
}
