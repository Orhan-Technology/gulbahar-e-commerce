import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchX } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SectionHeader } from '@/components/custom/section-header';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { ShopGrid, ShopGridSkeleton } from '@/components/shop/shop-grid';
import { SearchBox } from '@/components/custom/search-box';
import { currentUser } from '@/lib/auth/guards';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { promotedProductsForSlot } from '@/lib/db/queries/listing';
import { trendingProducts } from '@/lib/db/queries/products';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { searchProducts, searchShops } from '@/lib/db/queries/search';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Search results (PRD §5.1, §5.2). Products by default with a tab for shops.
 *
 * Tabs are links rather than client state so each tab is its own URL — shareable,
 * and the results stay server-rendered.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q, tab } = await searchParams;
  const t = await getTranslations('search');

  const term = q?.trim() ?? '';
  const activeTab = tab === 'shops' ? 'shops' : 'products';

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{term ? t('resultsFor', { term }) : t('title')}</h1>

      <SearchBox placeholder={t('placeholder')} />

      {term && (
        <div role="tablist" className="border-border flex gap-2 border-b">
          {(['products', 'shops'] as const).map((value) => (
            <Link
              key={value}
              role="tab"
              aria-selected={activeTab === value}
              href={`/search?q=${encodeURIComponent(term)}${value === 'shops' ? '&tab=shops' : ''}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                activeTab === value
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              {t(value)}
            </Link>
          ))}
        </div>
      )}

      {!term ? (
        <Suspense fallback={<ProductGridSkeleton count={10} />}>
          <PopularFallback locale={locale} heading={t('popularTitle')} />
        </Suspense>
      ) : activeTab === 'shops' ? (
        <Suspense fallback={<ShopGridSkeleton />}>
          <ShopResults term={term} />
        </Suspense>
      ) : (
        <Suspense fallback={<ProductGridSkeleton count={12} />}>
          <ProductResults term={term} locale={locale} />
        </Suspense>
      )}
    </div>
  );
}

async function ProductResults({ term, locale }: { term: string; locale: string }) {
  const t = await getTranslations('search');

  const [results, promoted, user] = await Promise.all([
    searchProducts(term, { limit: 48, locale }),
    promotedProductsForSlot('search_top'),
    currentUser(),
  ]);

  const promotedIds = new Set(promoted.map((item) => item.id));
  const organic = results.filter((item) => !promotedIds.has(item.id));

  const saved = await wishlistedProductIds(user?.id, [
    ...promoted.map((i) => i.id),
    ...organic.map((i) => i.id),
  ]);

  // Zero results still shows something useful (PRD §5.2).
  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          illustration={<SearchX className="h-7 w-7" />}
          title={t('noResultsTitle', { term })}
          description={t('noResultsBody')}
          action={{ label: t('browseAll'), href: '/products' }}
        />
        <PopularFallback locale={locale} heading={t('popularTitle')} />
      </div>
    );
  }

  void recordImpressions(promoted.map((item) => item.campaignId));

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t('productCount', { count: formatNumber(results.length, locale) })}
      </p>

      {promoted.length > 0 && (
        <section className="rounded-card border-accent-200 bg-accent-50/40 space-y-2 border p-3">
          <div className="flex items-center gap-2">
            <SponsoredBadge />
            <span className="text-accent-800 text-xs">{t('promotedNote')}</span>
          </div>
          <ProductGrid
            items={promoted.map((i) => ({ ...i, sponsored: true }))}
            savedIds={saved}
            priority
          />
        </section>
      )}

      <ProductGrid items={organic} savedIds={saved} priority={promoted.length === 0} />
    </div>
  );
}

async function ShopResults({ term }: { term: string }) {
  const t = await getTranslations('search');
  const results = await searchShops(term, { limit: 24 });

  if (results.length === 0) {
    return (
      <EmptyState
        illustration={<SearchX className="h-7 w-7" />}
        title={t('noShopsTitle', { term })}
        description={t('noShopsBody')}
        action={{ label: t('allShops'), href: '/shops' }}
      />
    );
  }

  return <ShopGrid items={results} />;
}

/** Popular products, shown for an empty query and beneath a zero-result search. */
async function PopularFallback({ locale, heading }: { locale: string; heading: string }) {
  const [items, user] = await Promise.all([trendingProducts(locale, 10), currentUser()]);
  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  return (
    <section className="space-y-3">
      <SectionHeader title={heading} href="/products" />
      <ProductGrid items={items} savedIds={saved} />
    </section>
  );
}
