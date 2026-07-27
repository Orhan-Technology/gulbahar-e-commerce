import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/custom/section-header';
import { CategoryTiles, CategoryTilesSkeleton } from '@/components/shop/home/category-tiles';
import { FeaturedShops, FeaturedShopsSkeleton } from '@/components/shop/home/featured-shops';
import { HeroBanner, HeroBannerSkeleton } from '@/components/shop/home/hero-banner';
import { OffersStrip, OffersStripSkeleton } from '@/components/shop/home/offers-strip';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { newArrivals, trendingProducts } from '@/lib/db/queries/products';

/**
 * Storefront home — quality-bar screen #1 (PRD §10.8).
 *
 * Each section is its own Suspense boundary so a slower query never blocks the
 * hero from painting, and every fallback matches its final layout exactly so
 * there is no shift on swap (PRD §10.5).
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-4 sm:py-6">
      <Suspense fallback={<HeroBannerSkeleton />}>
        <HeroBanner />
      </Suspense>

      <Suspense fallback={<CategoryTilesSkeleton />}>
        <CategoryTiles />
      </Suspense>

      <Suspense fallback={<OffersStripSkeleton />}>
        <OffersStrip />
      </Suspense>

      <Suspense fallback={<FeaturedShopsSkeleton />}>
        <FeaturedShops />
      </Suspense>

      <Suspense fallback={<ProductRowSkeleton title={t('trending')} />}>
        <TrendingRow />
      </Suspense>

      <Suspense fallback={<ProductRowSkeleton title={t('newArrivals')} />}>
        <NewArrivalsRow />
      </Suspense>
    </div>
  );
}

async function TrendingRow() {
  const t = await getTranslations('home');
  const [items, user] = await Promise.all([trendingProducts('fa', 10), currentUser()]);
  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeader title={t('trending')} description={t('trendingHint')} href="/products" />
      {/* Two rows on desktop, one horizontal scroller on mobile. */}
      <ProductGrid items={items} savedIds={saved} layout="row" priority />
    </section>
  );
}

async function NewArrivalsRow() {
  const t = await getTranslations('home');
  const [items, user] = await Promise.all([newArrivals('fa', 10), currentUser()]);
  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
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
    <section className="space-y-3">
      <SectionHeader title={title} />
      <ProductGridSkeleton count={5} layout="row" />
    </section>
  );
}
