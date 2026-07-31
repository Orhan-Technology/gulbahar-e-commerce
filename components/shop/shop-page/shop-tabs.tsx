import { getTranslations } from 'next-intl/server';

import { pressable } from '@/components/motion/pressable';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export const SHOP_TABS = ['products', 'offers', 'about', 'reviews'] as const;
export type ShopTab = (typeof SHOP_TABS)[number];

/** Anything unrecognised falls back to the catalogue rather than 404ing. */
export function parseShopTab(value: string | string[] | undefined): ShopTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return SHOP_TABS.includes(raw as ShopTab) ? (raw as ShopTab) : 'products';
}

/**
 * The shop page's tab bar (Prompt C8).
 *
 * LINKS, NOT STATE. Each tab is a real URL (`?tab=about`), server-rendered,
 * shareable, back-buttonable and indexable. A client-side tab component would
 * have made all four tabs' data load on every visit and left "the reviews of
 * this shop" with no address of its own.
 *
 * The COUNTS matter more than they look. A tab labelled only "Offers" is a
 * question — is there anything in there — and the honest answer belongs on the
 * label, so nobody pays a page load to find an empty tab.
 *
 * `aria-current="page"` rather than a `role="tablist"`: these navigate, and
 * announcing them as tabs would promise keyboard behaviour (arrow keys moving
 * between panels without leaving the page) that links do not have.
 */
export async function ShopTabs({
  slug,
  active,
  counts,
  locale,
}: {
  slug: string;
  active: ShopTab;
  counts: { products: number; offers: number; reviews: number };
  locale: string;
}) {
  const t = await getTranslations('shopPage.tabs');

  const countFor = (tab: ShopTab) =>
    tab === 'about' ? null : counts[tab as 'products' | 'offers' | 'reviews'];

  return (
    <nav
      aria-label={t('label')}
      data-shop-tabs
      className="border-border -mx-4 mt-6 flex gap-1 overflow-x-auto border-b px-4 scrollbar-none sm:mx-0 sm:px-0"
    >
      {SHOP_TABS.map((tab) => {
        const isActive = tab === active;
        const count = countFor(tab);

        return (
          <Link
            key={tab}
            // `tab=products` is the default, so it is left OFF the URL: the
            // canonical address of a shop stays /shops/slug, and the link
            // back from another tab returns to it rather than to a variant.
            href={tab === 'products' ? `/shops/${slug}` : `/shops/${slug}?tab=${tab}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            data-tab={tab}
            // The raw count, so a check can compare it with the database
            // without unpicking Persian numerals (scripts/check-shop.ts).
            data-tab-count={count ?? undefined}
            className={cn(
              pressable,
              'shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-[color,border-color,scale] duration-150 ease-out',
              isActive
                ? 'border-primary text-primary font-bold'
                : 'hover:text-foreground border-transparent text-neutral-600',
            )}
          >
            {t(tab)}
            {count !== null && count > 0 && (
              <span className="text-muted-foreground ms-1.5 text-xs tabular-nums">
                {formatNumber(count, locale)}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
