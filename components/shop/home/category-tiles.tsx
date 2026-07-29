import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  Baby,
  Dumbbell,
  Gem,
  type LucideIcon,
  Nut,
  Shirt,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { categoryTree } from '@/lib/db/queries/shops';
import { formatNumber } from '@/lib/format';
import { Rail } from '@/components/shop/rail';
import { Link } from '@/lib/i18n/navigation';

/**
 * Category tiles (PRD §5.1). Eight across on desktop, horizontal scroll on
 * mobile — the scroller inherits document direction, so in Dari it starts at the
 * right and scrolls leftward with no per-locale duplication (PRD §10.3).
 *
 * A category has an image when one has been set and falls back to its icon on a
 * tinted disc. Both are round tiles of the same size, so a mixed row still reads
 * as one rhythm rather than as some tiles being broken.
 */
const ICONS: Record<string, LucideIcon> = {
  electronics: Smartphone,
  beauty: Sparkles,
  clothing: Shirt,
  'home-kitchen': UtensilsCrossed,
  'watches-jewellery': Gem,
  'kids-hobby': Baby,
  sports: Dumbbell,
  food: Nut,
};

export async function CategoryTiles() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const tCategories = await getTranslations('categories');
  const tree = await categoryTree(locale);

  if (tree.length === 0) return null;

  return (
    <section className="space-y-5">
      <SectionHeader title={t('shopByCategory')} href="/categories" />

      <Rail label={t('shopByCategory')} size="tile">
        {tree.map((category) => {
          const Icon = ICONS[category.slug] ?? Sparkles;
          return (
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className="pressable group flex flex-col items-center gap-3 text-center"
            >
              <span className="rounded-pill relative flex aspect-square w-full items-center justify-center overflow-hidden bg-neutral-100 transition-transform duration-150 group-hover:scale-105">
                {category.imagePath ? (
                  <Image
                    src={category.imagePath}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <span className="bg-primary-50 text-primary flex h-full w-full items-center justify-center">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                )}
              </span>

              <span className="clamp-2 text-foreground group-hover:text-primary text-sm leading-tight font-semibold transition-colors duration-150">
                {pickLocale(category.name, locale)}
              </span>

              {/*
               * Hidden at zero rather than rendered as a bare "٠". The food
               * category legitimately has none — its only shop is the pending
               * one held back for the live approval moment — and a lone zero
               * under a tile reads as a broken counter, not as "nothing yet".
               */}
              {category.productCount > 0 && (
                <span className="text-2xs -mt-1 text-neutral-500">
                  {tCategories('productCount', {
                    count: formatNumber(category.productCount, locale),
                  })}
                </span>
              )}
            </Link>
          );
        })}
      </Rail>
    </section>
  );
}

export function CategoryTilesSkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeaderSkeleton />
      <div className="-mx-4 flex scrollbar-none gap-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&>*]:w-[22%] [&>*]:shrink-0 sm:[&>*]:w-[14%] lg:[&>*]:w-[11%]">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex flex-col items-center gap-3">
            <Skeleton className="rounded-pill aspect-square w-full" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </section>
  );
}
