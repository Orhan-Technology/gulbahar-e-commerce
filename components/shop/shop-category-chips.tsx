import { getLocale, getTranslations } from 'next-intl/server';

import { pressable } from '@/components/motion/pressable';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The directory's category row (PRD §5.1, NN/g).
 *
 * URL-driven (`?category=`) rather than client state, so a filtered directory
 * is shareable, survives the back button and stays server-rendered — the same
 * rule the product listing's facets follow.
 *
 * `snap-x` on the scroller and `snap-start` on each chip: a free-scrolling row
 * of pills reliably comes to rest with one sliced in half at the edge, which
 * reads as a rendering fault rather than as more content.
 */
export async function ShopCategoryChips({
  categories,
  active,
}: {
  categories: Array<{ id: string; slug: string; name: LocalizedText }>;
  active?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shops');

  const chip = (isActive: boolean) =>
    cn(
      pressable,
      'rounded-pill snap-start shrink-0 border px-3.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out',
      isActive
        ? 'border-primary bg-primary text-primary-foreground font-semibold'
        : 'border-border bg-card hover:border-primary hover:text-primary',
    );

  return (
    <nav className="-mx-4 flex scrollbar-none snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <Link href="/shops" aria-current={active ? undefined : 'page'} className={chip(!active)}>
        {t('allCategories')}
      </Link>

      {categories.map((category) => {
        const isActive = active === category.slug;
        return (
          <Link
            key={category.id}
            // The active chip clears back to everything, so it is a toggle
            // rather than a dead end needing the back button.
            href={isActive ? '/shops' : `/shops?category=${category.slug}`}
            aria-current={isActive ? 'page' : undefined}
            className={chip(isActive)}
          >
            {pickLocale(category.name, locale)}
          </Link>
        );
      })}
    </nav>
  );
}
