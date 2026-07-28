import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronRight, LayoutGrid } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { categoryTree } from '@/lib/db/queries/shops';
import { Link } from '@/lib/i18n/navigation';

/**
 * "Shop by department" — the reference's tinted browse band (PRD §5.1).
 *
 * The idiom is the design's most distinctive container: a large soft-cornered
 * panel in the ONE tint, holding white cards that each carry a product
 * photograph over a label. It reads as a shelf, and it is the only place on the
 * page where cards sit on something rather than on the page itself.
 *
 * ONE band, not one per department. The reference runs a separate band for each
 * top category — "Laptops & Accessories", "Fashion & Style" — with five
 * sub-category cards in each. Gulbahar's tree is eight departments of two
 * children apiece (PRD §4.2), so that shape would produce eight panels of two
 * cards: mostly empty container, repeated eight times. The same idiom applied
 * once, to all sixteen, gives the density the design is actually made of.
 *
 * A leaf with no stock is dropped rather than shown empty — the food
 * department stays out until its shop is approved on stage, with no conditional
 * on the home page.
 */
export async function BrowseBand() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const common = await getTranslations('common');
  const tree = await categoryTree(locale);

  const leaves = tree
    .flatMap((root) => root.children.map((child) => ({ ...child, root })))
    .filter((leaf) => leaf.productCount > 0);

  if (leaves.length === 0) return null;

  return (
    <section className="rounded-panel bg-neutral-100 p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-foreground flex items-center gap-2.5 text-2xl font-bold">
          <LayoutGrid className="text-primary h-5 w-5 shrink-0" aria-hidden />
          {t('browseHeading')}
        </h2>
        <Link
          href="/categories"
          className="text-primary hover:text-primary-800 ms-auto inline-flex items-center gap-1 text-sm font-semibold transition-colors duration-150"
        >
          {common('viewAll')}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {leaves.map((leaf) => (
          <li key={leaf.id}>
            <Link
              href={`/categories/${leaf.slug}`}
              className="rounded-card bg-card hover:shadow-card group flex h-full flex-col items-center gap-3 p-3 transition-shadow duration-200"
            >
              <span className="rounded-media relative aspect-square w-full overflow-hidden bg-neutral-100">
                {leaf.imagePath && (
                  <Image
                    src={leaf.imagePath}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 40vw, 150px"
                    // motion-decorative: a slow settle inside the frame, held to
                    // the 500ms budget rather than the 300ms feedback one.
                    className="object-cover transition-transform duration-[420ms] ease-[var(--ease-settle)] group-hover:scale-105"
                  />
                )}
              </span>
              <span className="text-foreground group-hover:text-primary line-clamp-2 text-center text-sm font-semibold transition-colors duration-150">
                {pickLocale(leaf.name, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BrowseBandSkeleton() {
  return (
    <section className="rounded-panel bg-neutral-100 p-5 sm:p-7">
      <Skeleton className="mb-5 h-7 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="rounded-card bg-card flex flex-col items-center gap-3 p-3">
            <Skeleton className="rounded-media aspect-square w-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
