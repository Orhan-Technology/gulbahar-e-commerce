import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { CategoryMark, categoryMarkSurface } from '@/components/shop/listing/category-mark';
import { formatNumber } from '@/lib/format';
import { pickLocale } from '@/lib/db/localized';
import { categoryTree } from '@/lib/db/queries/shops';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Category index (PRD §5.1): every parent with its children, each carrying a live
 * product count so a customer can see where the catalogue actually is.
 *
 * PHOTOGRAPHY, because this page is the taxonomy and the taxonomy is how a
 * shopper who does not know what they want gets moving. It was a sitemap — nine
 * bordered rectangles of text — on a storefront whose every other surface leads
 * with a picture.
 *
 * THE CHILDREN ARE THE HOME PAGE'S CIRCLES, exactly. Not a similar tile: the
 * same disc, the same derived photograph, the same icon fallback, the same
 * label — because a department a shopper met on the home page has to be
 * recognisable here, and it was not: a 4/3 photo in a bordered card with a
 * shadow is a different object from a circle, however identical the picture
 * inside it.
 *
 * …AND IT IS WHAT FIXES THE STAGGERED GRID. The children sat in a four-column
 * grid per group, so a department with one subcategory rendered one card and
 * three empty cells — «خانه و آشپزخانه» and «ورزش» each read as a row that had
 * failed to load, and every group started at a different rhythm down the page.
 * A grid PROMISES equal cells and owes you the missing ones; a wrapped row of
 * circles promises nothing, so a group of one is simply a group of one. Wrapped
 * rather than scrolled, because this page's job is the taxonomy ENTIRE — a
 * scroller that hides half of «پوشاک» is the one thing /categories may not do.
 *
 * ONE COUNT PER GROUP. The heading's count and every child's count were the
 * same fact stated twice on one screen, and they do not even agree: a parent
 * counts its descendants, so «الکترونیک ۱۱ محصول» sat above three tiles reading
 * ۶, ۳ and ۲. The group states the size; the tiles say which departments exist.
 *
 * THE «دیدن همه» LINK SITS WITH ITS HEADING. Pushed to the far end by a spacer,
 * it was nine hundred pixels away from the words it belongs to across an empty
 * RTL field — a link nobody would ever find because nothing connects it to the
 * section it opens. Beside the title it is a phrase, not a stray control.
 *
 * AN EMPTY CATEGORY IS LABELLED AND INERT. Its tile does not navigate — there is
 * nothing behind it — and it keeps «به‌زودی» under the name, which is a STATE
 * and not the count this page just removed: without it a dead tile is
 * indistinguishable from a live one that failed to respond.
 */
export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('categories');
  const tCommon = await getTranslations('common');
  const tree = await categoryTree(locale);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-4 sm:py-6">
      <div>
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('indexSubtitle')}</p>
      </div>

      {tree.map((parent) => {
        const stocked = parent.productCount > 0;

        return (
          <section key={parent.id} className="space-y-4">
            {/* Title, count and the link as ONE line of reading matter. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-foreground text-lg font-bold">
                {pickLocale(parent.name, locale)}
              </h2>
              <span className="text-muted-foreground text-xs">
                {stocked
                  ? t('productCount', { count: formatNumber(parent.productCount, locale) })
                  : t('comingSoon')}
              </span>
              {stocked && (
                <Link
                  href={`/categories/${parent.slug}`}
                  className="rounded-control text-primary hover:text-primary-800 inline-flex items-center gap-1 text-sm font-semibold transition-colors duration-150"
                >
                  {tCommon('viewAll')}
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                </Link>
              )}
            </div>

            {/* The tile widths are the `tile` rail's own (components/shop/rail.tsx),
                so a row here and a row on the home page break at the same
                places at every width. */}
            <div className="flex flex-wrap gap-4">
              {parent.children.map((child) => {
                const childStocked = child.productCount > 0;

                const body = (
                  <>
                    <span className="rounded-pill relative flex aspect-square w-full items-center justify-center overflow-hidden bg-neutral-100">
                      {child.imagePath ? (
                        <Image
                          src={child.imagePath}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 25vw, (max-width: 1024px) 15vw, 150px"
                          className="object-cover"
                        />
                      ) : (
                        <span className={categoryMarkSurface}>
                          <CategoryMark slug={child.slug} />
                        </span>
                      )}
                    </span>

                    <span
                      className={cn(
                        'clamp-2 text-foreground block text-center text-sm leading-tight font-semibold',
                        childStocked && 'group-hover:text-primary transition-colors duration-150',
                      )}
                    >
                      {pickLocale(child.name, locale)}
                    </span>

                    {!childStocked && (
                      <span className="text-2xs -mt-1 block text-center text-neutral-500">
                        {t('comingSoon')}
                      </span>
                    )}
                  </>
                );

                const surface =
                  'group flex w-[22%] flex-col gap-3 sm:w-[14%] lg:w-[11%]';

                // Not a link, and not a disabled one either: there is nothing
                // behind it to reach, so it is simply a tile that states a fact.
                return childStocked ? (
                  <Link
                    key={child.id}
                    href={`/categories/${child.slug}`}
                    className={cn(
                      surface,
                      'pressable [&>span:first-child]:transition-transform [&>span:first-child]:duration-150 hover:[&>span:first-child]:scale-105',
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={child.id} className={cn(surface, 'opacity-70')} aria-disabled>
                    {body}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
