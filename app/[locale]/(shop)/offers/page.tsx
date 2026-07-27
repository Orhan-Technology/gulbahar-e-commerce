import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Tag } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SectionHeader } from '@/components/custom/section-header';
import { OffersStrip, OffersStripSkeleton } from '@/components/shop/home/offers-strip';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { currentUser } from '@/lib/auth/guards';
import { discountedProducts, wishlistedProductIds } from '@/lib/db/queries/home';

/**
 * Offers page (PRD §4, §5.1). Shop-funded discounts, so no Sponsored badge —
 * these cost the shop margin rather than buying position (PRD §8.1).
 */
export default async function OffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('offers');

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-4 sm:py-6">
      <div>
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>

      <Suspense fallback={<OffersStripSkeleton />}>
        <OffersStrip />
      </Suspense>

      <Suspense fallback={<ProductGridSkeleton count={12} />}>
        <DiscountedProducts />
      </Suspense>
    </div>
  );
}

async function DiscountedProducts() {
  const t = await getTranslations('offers');
  const [items, user] = await Promise.all([discountedProducts(24), currentUser()]);
  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  if (items.length === 0) {
    return (
      <EmptyState
        illustration={<Tag className="h-7 w-7" />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
        action={{ label: t('browseAll'), href: '/products' }}
      />
    );
  }

  return (
    <section className="space-y-3">
      <SectionHeader title={t('discountedProducts')} description={t('biggestFirst')} />
      <ProductGrid items={items} savedIds={saved} priority />
    </section>
  );
}
