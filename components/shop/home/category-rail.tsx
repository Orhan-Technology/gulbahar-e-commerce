import { getLocale, getTranslations } from 'next-intl/server';

import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { pickLocale } from '@/lib/db/localized';
import { categoryBestsellers, wishlistedProductIds } from '@/lib/db/queries/home';
import { categoryBySlug } from '@/lib/db/queries/shops';
import { currentUser } from '@/lib/auth/guards';

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
  priority = false,
}: {
  slug: string;
  priority?: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const [items, category] = await Promise.all([// Twelve, not five: at desktop a rail shows five and a bit, so a five-item
    // feed makes the peek, the arrows and the scrollbar all promise something
    // that is not there.
    categoryBestsellers(slug, 12), categoryBySlug(slug)]);

  // Both must be present: an unknown slug is a coding mistake, not an empty
  // state, and rendering "Bestsellers in undefined" would hide it.
  if (items.length === 0 || !category) return null;

  const user = await currentUser();
  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('bestsellersIn', { category: pickLocale(category.name, locale) })}
        href={`/categories/${slug}`}
      />
      <ProductGrid
        items={items}
        savedIds={saved}
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
