import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SearchBox } from '@/components/custom/search-box';
import { FacetControls } from '@/components/shop/listing/facet-controls';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { AboutTab } from '@/components/shop/shop-page/about-tab';
import { MerchandisingRows } from '@/components/shop/shop-page/merchandising-rows';
import { OffersTab } from '@/components/shop/shop-page/offers-tab';
import { ReviewsTab } from '@/components/shop/shop-page/reviews-tab';
import { ShopHero } from '@/components/shop/shop-page/shop-hero';
import { parseShopTab, ShopTabs } from '@/components/shop/shop-page/shop-tabs';
import { InShopCategories } from '@/components/shop/shop-page/in-shop-categories';
import { currentUser } from '@/lib/auth/guards';
import { filterFacets } from '@/lib/db/queries/listing';
import { siteSettings } from '@/lib/db/queries/settings';
import {
  shopActiveOffers,
  shopCategories,
  shopFollowState,
  shopServiceRating,
} from '@/lib/db/queries/shop-page';
import { categoryTree, shopDetail } from '@/lib/db/queries/shops';
import { decodeSlug } from '@/lib/utils';

/**
 * The shop page (PRD §5.1, Prompt C8).
 *
 * FOUR TABS, EACH A REAL URL. Products, offers, about, reviews — `?tab=` rather
 * than client state, so every one of them is shareable, back-buttonable,
 * server-rendered and indexable, and so three of them cost nothing to visit a
 * page that only wants the fourth.
 *
 * The PRODUCTS tab is still the same listing component as /categories and
 * /search, scoped to this shop: same toolbar, same sort, same facets, same
 * chips, same load-more. A shopper who learned to narrow a category page must
 * not have to learn something else on stepping into a shop. What C8 adds above
 * it is merchandising — what sells, what people are looking at, what is new —
 * which is the part a mall page can do that a search results page cannot.
 *
 * The SHOP facet is hidden throughout: on this page it can only navigate away
 * from the shop the page is about.
 *
 * A shop that is not approved 404s rather than rendering — a pending shop's
 * catalogue stays invisible until admin flips the switch (PRD §7.1).
 */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<ListingSearchParams & { tab?: string }>;
}) {
  const { locale, slug: rawSlug } = await params;
  // Non-ASCII slugs arrive percent-encoded (see decodeSlug).
  const slug = decodeSlug(rawSlug);
  setRequestLocale(locale);
  const query = await searchParams;
  const tab = parseShopTab(query.tab);

  const shop = await shopDetail(slug);
  if (!shop || shop.status !== 'approved') notFound();

  /*
   * The clock is read ONCE, here, and handed down. A client component may not
   * call `new Date()` during render (React 19 purity, CLAUDE.md), and reading
   * it twice on one page could put the open pill and the offer countdown a
   * second apart.
   */
  const now = new Date();

  // The follow state needs the viewer, so the session is resolved first; the
  // three reads that do not depend on it run together.
  const user = await currentUser();
  const [settings, followState, offers, serviceRating] = await Promise.all([
    siteSettings(),
    shopFollowState(shop.id, user?.id),
    shopActiveOffers(shop.id, now),
    shopServiceRating(shop.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-6">
      <ShopHero
        shop={shop}
        follow={followState}
        mallHours={settings.hours}
        now={now}
        signedIn={Boolean(user?.id)}
      />

      <ShopTabs
        slug={slug}
        active={tab}
        counts={{
          products: shop.productCount,
          offers: offers.length,
          reviews: serviceRating.total,
        }}
        locale={locale}
      />

      <div className="mt-6">
        {tab === 'products' && (
          <ProductsTab
            slug={slug}
            shopId={shop.id}
            productCount={shop.productCount}
            locale={locale}
            query={query}
          />
        )}
        {tab === 'offers' && <OffersTab shopId={shop.id} shopSlug={slug} />}
        {tab === 'about' && <AboutTab shop={shop} now={now} />}
        {tab === 'reviews' && <ReviewsTab shopId={shop.id} />}
      </div>
    </div>
  );
}

/**
 * The catalogue, with the shop's own merchandising above it.
 *
 * The IN-SHOP CATEGORY CHIPS list only the categories this shop actually
 * stocks. The global facet panel offers the whole tree, which on a shoe shop's
 * page means twenty-three categories that return nothing — the chips are the
 * fast path and the panel is the complete one.
 *
 * The merchandising rows are HIDDEN the moment a filter is applied. Someone who
 * has typed a search or picked a category is looking for a specific thing, and
 * three rails of "what else we sell" between them and their results is the
 * marketplace pattern that makes filtered pages feel broken.
 */
async function ProductsTab({
  slug,
  shopId,
  productCount,
  locale,
  query,
}: {
  slug: string;
  shopId: string;
  productCount: number;
  locale: string;
  query: ListingSearchParams & { tab?: string };
}) {
  const t = await getTranslations('shop');

  const [facets, tree, inShopCategories] = await Promise.all([
    // Scoped to this shop: without it the brand facet would list all
    // twenty-eight brands in the mall on a page selling five products.
    filterFacets(locale, { query, scope: { shopIds: [shopId] } }),
    categoryTree(locale),
    shopCategories(shopId),
  ]);

  const facetOptions = {
    ...facets,
    categories: tree,
    hide: ['shop'] as Array<'category' | 'shop'>,
  };

  const browsing = !query.q && !query.category && !query.priceMin && !query.priceMax;

  return (
    <div className="space-y-8">
      {browsing && <MerchandisingRows shopId={shopId} productCount={productCount} />}

      <div className="space-y-4">
        <h2 className="text-base font-bold">{t('catalogue')}</h2>

        {inShopCategories.length > 1 && (
          <InShopCategories
            slug={slug}
            categories={inShopCategories}
            active={typeof query.category === 'string' ? query.category : undefined}
          />
        )}

        <SearchBox placeholder={t('searchInShop')} />

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <FacetControls {...facetOptions} />
          </aside>

          <div className="min-w-0">
            <Suspense fallback={<ProductListingSkeleton />}>
              <ProductListing
                query={query}
                locale={locale}
                facets={facetOptions}
                scope={{ shopIds: [shopId] }}
                emptyHref={`/shops/${slug}`}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
