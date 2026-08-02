import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/custom/section-header';
import { CategoryRail, CategoryRailSkeleton } from '@/components/shop/home/category-rail';
import { CategoryTiles, CategoryTilesSkeleton } from '@/components/shop/home/category-tiles';
import { DealsRail, DealsRailSkeleton } from '@/components/shop/home/deals-rail';
import { FeaturedShops, FeaturedShopsSkeleton } from '@/components/shop/home/featured-shops';
import { HeroBanner, HeroBannerSkeleton } from '@/components/shop/home/hero-banner';
import { PromoStrip, PromoStripSkeleton } from '@/components/shop/home/promo-strip';
import { RecentlyViewedBand } from '@/components/shop/home/recently-viewed-band';
import { SellerCta } from '@/components/shop/home/seller-cta';
import { ShopSpotlight, ShopSpotlightSkeleton } from '@/components/shop/home/shop-spotlight';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { Reveal } from '@/components/shop/reveal';
import { currentUser } from '@/lib/auth/guards';
import { homeProductModules, wishlistedProductIds } from '@/lib/db/queries/home';

/**
 * Storefront home — quality-bar screen #1 (PRD §10.8).
 *
 * MODULE RHYTHM is the organising rule: no two adjacent bands share a shape.
 * Hero → circles → rail → panels → rail → rail → rich rail → feature → grid →
 * CTA. The page previously ran six near-identical category rails, which is how
 * a long page becomes an undifferentiated scroll however good each band is.
 *
 * ONE CATEGORY MODULE. The circles rail is the single category entry point
 * here; departments live in the header nav and on /categories, and
 * subcategories are the tiles on a category page (D4). "Shop by department" —
 * sixteen more tiles, a third of the way down — was a second answer to a
 * question already answered above the fold.
 *
 * ONE COUNTDOWN. It belongs to the deals band, the only module whose subject is
 * time running out. The hero's side card carries a discount and a shop, not a
 * second clock ticking against it.
 *
 * NO PRODUCT TWICE. The product-bearing bands are filled from one assembly
 * (`homeProductModules`) top-to-bottom, so each takes what is left after the
 * ones above it. See that function for why they share a Suspense boundary.
 */

/**
 * The two category rails, chosen for depth: clothing and electronics are the
 * deepest catalogues, so they are the two that can still fill a scroller after
 * the deals band has taken its pick. Four more below them was the old page's
 * real problem — variety cannot come from repetition.
 */
const RAIL_SLUGS = ['clothing', 'electronics'] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="max-w-page mx-auto space-y-12 px-4 py-4 sm:px-7 sm:py-6">
      <Suspense fallback={<HeroBannerSkeleton />}>
        <HeroBanner />
      </Suspense>

      <Suspense fallback={<CategoryTilesSkeleton />}>
        <CategoryTiles />
      </Suspense>

      {/* One boundary around every band that shows products — the price of
          deterministic dedupe, and on a local database it is a few ms. */}
      <Suspense fallback={<ProductModulesSkeleton />}>
        <ProductModules locale={locale} />
      </Suspense>

      <Reveal>
        <SellerCta />
      </Reveal>
    </div>
  );
}

async function ProductModules({ locale }: { locale: string }) {
  const t = await getTranslations('home');
  // The band's heading is the product page's, deliberately: it is the same
  // list under the same name, and two spellings of one feature is how a
  // shopper stops recognising it.
  const tRails = await getTranslations('product.rails');
  const { deals, rails, spotlight, arrivals } = await homeProductModules(locale, RAIL_SLUGS);

  const placed = [
    ...deals.map((item) => item.id),
    ...rails.flatMap((rail) => rail.items.map((item) => item.id)),
    ...(spotlight?.items ?? []).map((item) => item.id),
    ...arrivals.map((item) => item.id),
  ];

  const user = await currentUser();
  const saved = await wishlistedProductIds(user?.id, placed);

  return (
    <div className="space-y-12">
      <DealsRail items={deals} savedIds={saved} />

      {/* Panels between rails — the shape break that stops the page reading as
          one long scroller. */}
      <Reveal>
        <PromoStrip />
      </Reveal>

      {rails.map((rail, index) => (
        <Reveal key={rail.slug}>
          <CategoryRail
            slug={rail.slug}
            items={rail.items}
            savedIds={saved}
            priority={index === 0}
          />
        </Reveal>
      ))}

      {/*
        The reader's own trail, between the category rails and the editorial
        bands below them. It is the one module on this page whose contents the
        server cannot know, so it is a client component that renders NOTHING
        until it has three products — a first visit sees the page it always saw.
        It takes the same cross-band exclusion list as everything else, so a
        product cannot appear here and in the deals rail on one scroll.
      */}
      <RecentlyViewedBand excludeIds={placed} heading={tRails('recentlyViewed')} />

      <Reveal>
        <FeaturedShops />
      </Reveal>

      {spotlight && (
        <Reveal>
          <ShopSpotlight spotlight={spotlight} savedIds={saved} />
        </Reveal>
      )}

      {arrivals.length > 0 && (
        <Reveal>
          <section className="space-y-5">
            <SectionHeader
              title={t('newArrivals')}
              href="/products?sort=newest"
              description={t('newArrivalsHint')}
            />
            {/* The ONLY grid on the page, and last: two full rows are a good
                place to stop scrolling, and a rail here would be a fourth one. */}
            <ProductGrid items={arrivals} savedIds={saved} />
          </section>
        </Reveal>
      )}
    </div>
  );
}

function ProductModulesSkeleton() {
  return (
    <div className="space-y-12">
      <DealsRailSkeleton />
      <PromoStripSkeleton />
      <CategoryRailSkeleton />
      <CategoryRailSkeleton />
      <FeaturedShopsSkeleton />
      <ShopSpotlightSkeleton />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
