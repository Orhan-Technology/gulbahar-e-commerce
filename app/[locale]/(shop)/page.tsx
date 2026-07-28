import { Suspense } from 'react';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/custom/section-header';
import { BrowseBand, BrowseBandSkeleton } from '@/components/shop/home/browse-band';
import { CategoryRail, CategoryRailSkeleton } from '@/components/shop/home/category-rail';
import { CategoryTiles, CategoryTilesSkeleton } from '@/components/shop/home/category-tiles';
import { DealsRail, DealsRailSkeleton } from '@/components/shop/home/deals-rail';
import { FeaturedShops, FeaturedShopsSkeleton } from '@/components/shop/home/featured-shops';
import { HeroBanner, HeroBannerSkeleton } from '@/components/shop/home/hero-banner';
import { PromoStrip, PromoStripSkeleton } from '@/components/shop/home/promo-strip';
import { SellerCta } from '@/components/shop/home/seller-cta';
import { ShopSpotlight, ShopSpotlightSkeleton } from '@/components/shop/home/shop-spotlight';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { Reveal } from '@/components/shop/reveal';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { newArrivals } from '@/lib/db/queries/products';

/**
 * Storefront home — quality-bar screen #1 (PRD §10.8).
 *
 * Composed as the approved mockup lays it out: a split hero, category tiles, the
 * deal band with its live clock, then alternating product rails, shop bands and
 * promises down the page. Density is the point — a marketplace home that ends
 * after three sections reads as an empty marketplace.
 *
 * Each band is its own Suspense boundary so a slower query never blocks the hero
 * from painting, and every fallback matches its final layout exactly so there is
 * no shift on swap (PRD §10.5). The page itself awaits nothing but the locale, so
 * the shell is immediate.
 *
 * There is no global "trending" rail: it ranks by view count, which is exactly
 * what the per-category rails already do, so it rendered the same five products
 * a second time. New arrivals stays — it sorts by date, so it surfaces different
 * stock.
 *
 * The rails are listed by slug rather than derived from the category tree,
 * because the ORDER is an editorial decision — clothing and electronics lead
 * because they are the deepest catalogues — and because a rail whose category has
 * no visible stock removes itself. That is how the food rail stays absent until
 * the pending shop is approved on stage, with no conditional here.
 */
const LEAD_RAILS = ['clothing', 'electronics'] as const;
const MID_RAILS = ['beauty', 'home-kitchen'] as const;
const TAIL_RAILS = ['watches-jewellery', 'kids-hobby', 'sports', 'food'] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  return (
    <div className="max-w-page mx-auto space-y-12 px-4 py-4 sm:px-7 sm:py-6">
      <Suspense fallback={<HeroBannerSkeleton />}>
        <HeroBanner />
      </Suspense>

      <Suspense fallback={<CategoryTilesSkeleton />}>
        <CategoryTiles />
      </Suspense>

      <Suspense fallback={<DealsRailSkeleton />}>
        <DealsRail />
      </Suspense>

      <Suspense fallback={<PromoStripSkeleton />}>
        <PromoStrip />
      </Suspense>

      <Reveal>
        <Suspense fallback={<BrowseBandSkeleton />}>
          <BrowseBand />
        </Suspense>
      </Reveal>

      {LEAD_RAILS.map((slug) => (
        <Reveal key={slug}>
          <Suspense fallback={<CategoryRailSkeleton />}>
            <CategoryRail slug={slug} />
          </Suspense>
        </Reveal>
      ))}

      <Reveal>
        <Suspense fallback={<FeaturedShopsSkeleton />}>
          <FeaturedShops />
        </Suspense>
      </Reveal>

      {MID_RAILS.map((slug) => (
        <Reveal key={slug}>
          <Suspense fallback={<CategoryRailSkeleton />}>
            <CategoryRail slug={slug} />
          </Suspense>
        </Reveal>
      ))}

      <Reveal>
        <Suspense fallback={<ShopSpotlightSkeleton />}>
          <ShopSpotlight />
        </Suspense>
      </Reveal>

      {TAIL_RAILS.map((slug) => (
        <Reveal key={slug}>
          <Suspense fallback={<CategoryRailSkeleton />}>
            <CategoryRail slug={slug} />
          </Suspense>
        </Reveal>
      ))}

      <Reveal>
        <Suspense fallback={<ProductRowSkeleton title={t('newArrivals')} />}>
          <NewArrivalsRow />
        </Suspense>
      </Reveal>

      <Reveal>
        <SellerCta />
      </Reveal>
    </div>
  );
}

async function NewArrivalsRow() {
  const t = await getTranslations('home');
  const locale = await getLocale();
  const [items, user] = await Promise.all([newArrivals(locale, 10), currentUser()]);
  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  if (items.length === 0) return null;

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('newArrivals')}
        href="/products?sort=newest"
        description={t('newArrivalsHint')}
      />
      <ProductGrid items={items} savedIds={saved} layout="row" />
    </section>
  );
}

function ProductRowSkeleton({ title }: { title: string }) {
  return (
    <section className="space-y-5">
      <SectionHeader title={title} />
      <ProductGridSkeleton count={5} layout="row" />
    </section>
  );
}
