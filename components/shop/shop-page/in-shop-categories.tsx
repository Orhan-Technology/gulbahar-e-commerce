import { getLocale, getTranslations } from 'next-intl/server';

import { pressable } from '@/components/motion/pressable';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The in-shop category chips (Prompt C8).
 *
 * ONLY THE CATEGORIES THIS SHOP ACTUALLY STOCKS, with their counts. The facet
 * panel beside the grid offers the whole tree — which on a shoe shop's page is
 * twenty-three categories that return nothing — and that is the right behaviour
 * for a complete filter but the wrong first thing to hand someone. These chips
 * are the fast path: every one of them leads somewhere.
 *
 * Distinct from components/shop/shop-category-chips.tsx, which filters the shop
 * DIRECTORY and is hard-wired to /shops. Same visual language on purpose.
 *
 * The active chip links back to the unfiltered shop, so it toggles rather than
 * being a dead end that needs the back button.
 */
export async function InShopCategories({
  slug,
  categories,
  active,
}: {
  slug: string;
  categories: Array<{ slug: string; name: LocalizedText; total: number }>;
  active?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage');

  const chip = (isActive: boolean) =>
    cn(
      pressable,
      'rounded-pill snap-start shrink-0 border px-3.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out',
      isActive
        ? 'border-primary bg-primary text-primary-foreground font-semibold'
        : 'border-border bg-card hover:border-primary hover:text-primary',
    );

  return (
    <nav
      aria-label={t('inShopCategories')}
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0"
    >
      <Link href={`/shops/${slug}`} aria-current={active ? undefined : 'page'} className={chip(!active)}>
        {t('allInShop')}
      </Link>

      {categories.map((category) => {
        const isActive = active === category.slug;
        return (
          <Link
            key={category.slug}
            href={isActive ? `/shops/${slug}` : `/shops/${slug}?category=${category.slug}`}
            aria-current={isActive ? 'page' : undefined}
            className={chip(isActive)}
          >
            {pickLocale(category.name, locale)}
            <span className="ms-1.5 tabular-nums opacity-60">
              {formatNumber(category.total, locale)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
