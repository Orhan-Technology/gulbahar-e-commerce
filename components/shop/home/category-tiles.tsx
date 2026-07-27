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
import { formatNumber } from '@/lib/format';
import { pickLocale } from '@/lib/db/localized';
import { categoryTree } from '@/lib/db/queries/shops';
import { Link } from '@/lib/i18n/navigation';

/**
 * Category tiles (PRD §5.1). Horizontal scroll on mobile, grid from sm up.
 *
 * The scroller inherits document direction, so in Dari it starts at the right and
 * scrolls leftward — no per-locale duplication (PRD §10.3).
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
  const tree = await categoryTree(locale);

  if (tree.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeader title={t('shopByCategory')} href="/categories" />

      <div className="-mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-8">
        {tree.map((category) => {
          const Icon = ICONS[category.slug] ?? Sparkles;
          return (
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className="group rounded-card border-border bg-card shadow-card hover:shadow-overlay flex w-24 shrink-0 flex-col items-center gap-2 border p-3 text-center transition-shadow duration-150 sm:w-auto"
            >
              <span className="rounded-pill bg-primary-50 text-primary-700 group-hover:bg-primary-100 flex h-12 w-12 items-center justify-center transition-colors duration-150">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="clamp-2 text-foreground text-xs leading-tight font-medium">
                {pickLocale(category.name, locale)}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatNumber(category.productCount, locale)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function CategoryTilesSkeleton() {
  return (
    <section className="space-y-3">
      <SectionHeaderSkeleton />
      <div className="-mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="rounded-card border-border bg-card flex w-24 shrink-0 flex-col items-center gap-2 border p-3 sm:w-auto"
          >
            <Skeleton className="rounded-pill h-12 w-12" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </section>
  );
}
