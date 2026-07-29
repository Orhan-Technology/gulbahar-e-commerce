import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { FacetControls } from '@/components/shop/listing/facet-controls';
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
import { decodeSlug } from '@/lib/utils';

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

  const [facets, tree] = await Promise.all([filterFacets(locale), categoryTree(locale)]);

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

      <div className="mt-4 grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <FacetControls {...facetOptions} />
        </aside>

        <div className="min-w-0">
          <Suspense fallback={<ProductListingSkeleton />}>
            <ProductListing
              query={query}
              locale={locale}
              facets={facetOptions}
              scope={{ categoryId: category.id }}
              promotedSlot="category_top"
              emptyHref={`/categories/${slug}`}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
