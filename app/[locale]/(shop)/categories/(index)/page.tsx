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
 * with a picture, and the tiles here now borrow the same derived imagery the
 * home circles use so a department looks the same in both places.
 *
 * THE «دیدن همه» LINK SITS WITH ITS HEADING. Pushed to the far end by a spacer,
 * it was nine hundred pixels away from the words it belongs to across an empty
 * RTL field — a link nobody would ever find because nothing connects it to the
 * section it opens. Beside the title it is a phrase, not a stray control.
 *
 * AN EMPTY CATEGORY IS LABELLED AND INERT. «۰ محصول» on a card that navigates to
 * a page with nothing on it spends a tap to teach a shopper the mall is thin;
 * «به‌زودی» on a card that does not move says the same truth and costs nothing.
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {parent.children.map((child) => {
                const childStocked = child.productCount > 0;

                const body = (
                  <>
                    <span className="rounded-media relative block aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                      {child.imagePath ? (
                        <Image
                          src={child.imagePath}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px"
                          className="object-cover transition-transform duration-[420ms] ease-[var(--ease-settle)] group-hover:scale-105"
                        />
                      ) : (
                        <span className={categoryMarkSurface}>
                          <CategoryMark slug={child.slug} className="h-8 w-8" />
                        </span>
                      )}
                    </span>

                    <span className="block px-3 pb-3 pt-2.5">
                      <span
                        className={cn(
                          'text-foreground clamp-1 block text-sm font-semibold',
                          childStocked && 'group-hover:text-primary transition-colors duration-150',
                        )}
                      >
                        {pickLocale(child.name, locale)}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {childStocked
                          ? t('productCount', {
                              count: formatNumber(child.productCount, locale),
                            })
                          : t('comingSoon')}
                      </span>
                    </span>
                  </>
                );

                const surface =
                  'rounded-card border-border bg-card shadow-card group block overflow-hidden border';

                // Not a link, and not a disabled one either: there is nothing
                // behind it to reach, so it is simply a card that states a fact.
                return childStocked ? (
                  <Link
                    key={child.id}
                    href={`/categories/${child.slug}`}
                    className={cn(
                      surface,
                      'pressable hover:shadow-overlay transition-[box-shadow,translate,scale] duration-150 ease-out hover:-translate-y-0.5',
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
