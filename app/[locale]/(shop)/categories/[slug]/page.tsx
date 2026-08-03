import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { FacetControls } from '@/components/shop/listing/facet-controls';
import { PopularFallback } from '@/components/shop/listing/popular-fallback';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { SubcategoryTiles } from '@/components/shop/listing/subcategory-tiles';
import { pickLocale } from '@/lib/db/localized';
import { filterFacets } from '@/lib/db/queries/listing';
import { categoryBySlug, categoryTree } from '@/lib/db/queries/shops';
import { Link } from '@/lib/i18n/navigation';
import { cn, decodeSlug } from '@/lib/utils';

/**
 * Category listing (PRD §5.1, NN/g's merged category-and-listing page).
 *
 * The scope control and the narrowing controls are deliberately separated:
 * subcategory TILES sit above the toolbar as the next step into the department,
 * and price / rating / availability live in the facets below as ways of
 * trimming what is there. Collapsing the two — child categories as one more
 * checkbox group — is what makes a category page read as a filter form.
 *
 * The category axis is hidden from the facets here, because on this page it can
 * only navigate out of the page it belongs to.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<ListingSearchParams>;
}) {
  const { locale, slug: rawSlug } = await params;
  // Non-ASCII slugs arrive percent-encoded (see decodeSlug).
  const slug = decodeSlug(rawSlug);
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('categories');

  const category = await categoryBySlug(slug);
  if (!category) notFound();

  const [facets, tree] = await Promise.all([
    // Scoped to this category so the brand and shop counts describe what is on
    // the page rather than what is in the mall.
    filterFacets(locale, { query, scope: { categoryId: category.id } }),
    categoryTree(locale),
  ]);

  /*
   * The page may be a parent or one of its children, and the tiles belong to
   * the parent either way — so a child page can still move sideways to its
   * siblings rather than forcing a trip back up.
   */
  const parent = category.parentId
    ? tree.find((root) => root.id === category.parentId)
    : tree.find((root) => root.slug === slug);
  const children = parent?.children ?? [];

  const facetOptions = {
    ...facets,
    categories: tree,
    hide: ['category'] as Array<'category' | 'shop'>,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <nav className="text-muted-foreground text-xs">
        <Link href="/categories" className="hover:text-primary">
          {t('title')}
        </Link>
        {parent && parent.slug !== slug && (
          <>
            <span className="mx-1">/</span>
            <Link href={`/categories/${parent.slug}`} className="hover:text-primary">
              {pickLocale(parent.name, locale)}
            </Link>
          </>
        )}
        <span className="mx-1">/</span>
        <span className="text-foreground">{pickLocale(category.name, locale)}</span>
      </nav>

      <h1 className="mt-1 text-xl font-bold">{pickLocale(category.name, locale)}</h1>

      {parent && children.length > 0 && (
        <div className="mt-4">
          <SubcategoryTiles
            parentSlug={parent.slug}
            tiles={children}
            activeSlug={parent.slug === slug ? undefined : slug}
          />
        </div>
      )}

      {/*
        NO FILTER RAIL OVER AN EMPTY CATEGORY. The same rule the search page
        follows: a column of price bands and star ratings beside a shelf that
        has nothing on it is a form asking somebody to narrow nothing, and here
        it also pushed the "coming soon" panel into a third of the width.
        `facets.total` is the count under every current narrowing and comes back
        with the facet counts themselves, so this costs no extra query.
      */}
      <div
        className={cn('mt-4 grid gap-6', (facets.total ?? 0) > 0 && 'lg:grid-cols-[240px_1fr]')}
      >
        {(facets.total ?? 0) > 0 && (
          <aside className="hidden lg:block">
            <FacetControls {...facetOptions} />
          </aside>
        )}

        <div className="min-w-0">
          <Suspense fallback={<ProductListingSkeleton />}>
            <ProductListing
              query={query}
              locale={locale}
              facets={facetOptions}
              scope={{ categoryId: category.id }}
              promotedSlot="category_top"
              emptyHref={`/categories/${slug}`}
              /*
               * A category with no stock is not a failed query, so the dead end
               * gets the same recovery a zero-result search gets: something to
               * look at instead. Without it this page was a single empty panel
               * above eight hundred pixels of nothing.
               */
              emptyExtra={<PopularFallback />}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
