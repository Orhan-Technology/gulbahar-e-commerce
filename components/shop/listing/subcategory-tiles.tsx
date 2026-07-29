import Image from 'next/image';
import { getLocale } from 'next-intl/server';

import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type SubcategoryTile = {
  id: string;
  slug: string;
  name: LocalizedText;
  imagePath: string | null;
};

/**
 * Child categories, as image tiles ABOVE the toolbar (NN/g).
 *
 * Scope and narrowing are different actions and the research is unambiguous
 * about keeping them apart: "which part of this department" is a navigation
 * decision a shopper makes once, on arrival, and burying it among price and
 * rating checkboxes makes it look like one more optional filter. So it sits
 * above the toolbar, with photographs, where it reads as the next step into
 * the category rather than as a way of trimming it.
 *
 * A horizontal scroller below `sm`, a grid above. The scroller inherits
 * document direction, so in Dari it starts at the right and scrolls leftward
 * with no per-locale duplication (PRD §10.3).
 */
export async function SubcategoryTiles({
  parentSlug,
  tiles,
  activeSlug,
}: {
  parentSlug: string;
  /**
   * Named `tiles`, not `children`: a prop literally called `children` on a
   * component that does not render its JSX children is what the
   * react/no-children-prop rule exists to catch, and it would read as a
   * slot to anyone using this.
   */
  tiles: SubcategoryTile[];
  /** The child currently being viewed, if the URL has narrowed to one. */
  activeSlug?: string;
}) {
  const locale = await getLocale();
  if (tiles.length === 0) return null;

  return (
    /*
      Flex-wrap, not a grid. Departments have two or three children here, and a
      fixed 8-column grid left three tiles marooned against one edge with five
      empty cells beside them — which reads as a layout that failed to load.
      Wrapping keeps them together at their own size however many there are.
    */
    <nav className="-mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {tiles.map((child) => {
        const active = child.slug === activeSlug;
        return (
          <Link
            key={child.id}
            // Tapping the active child clears back to the parent, so a tile is
            // a toggle rather than a one-way trip that needs the back button.
            href={active ? `/categories/${parentSlug}` : `/categories/${child.slug}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              pressable,
              'group flex w-20 shrink-0 flex-col items-center gap-2 text-center transition-[scale] duration-150 ease-out',
            )}
          >
            <span
              className={cn(
                'rounded-media relative aspect-square w-20 overflow-hidden bg-neutral-100 transition-[box-shadow,outline-color] duration-150',
                active && 'outline-primary outline-2 outline-offset-2',
              )}
            >
              {child.imagePath && (
                <Image
                  src={child.imagePath}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover transition-transform duration-[420ms] ease-[var(--ease-settle)] group-hover:scale-105"
                />
              )}
            </span>
            <span
              className={cn(
                'clamp-2 text-2xs leading-tight font-semibold transition-colors duration-150',
                active ? 'text-primary' : 'text-foreground group-hover:text-primary',
              )}
            >
              {pickLocale(child.name, locale)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SubcategoryTilesSkeleton() {
  return (
    <div className="-mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex w-20 shrink-0 flex-col items-center gap-2">
          <Skeleton className="rounded-media aspect-square w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}
