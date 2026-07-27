import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Store } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { ShopGrid, ShopGridSkeleton } from '@/components/shop/shop-grid';
import { pickLocale } from '@/lib/db/localized';
import { promotedShopsForDirectory } from '@/lib/db/queries/listing';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { categoryBySlug, categoryTree, shopDirectory } from '@/lib/db/queries/shops';
import { searchShops } from '@/lib/db/queries/search';
import { Link } from '@/lib/i18n/navigation';
import { SearchBox } from '@/components/custom/search-box';

/**
 * Shop directory (PRD §5.1).
 *
 * directory_top placements sit in a bounded strip above the organic list, which is
 * ordered purely by derived rating (PRD §8.4).
 */
export default async function ShopsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q, category } = await searchParams;
  const t = await getTranslations('shops');

  const tree = await categoryTree(locale);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('subtitle')}</p>

      <SearchBox placeholder={t('searchPlaceholder')} />

      <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
        <Link
          href="/shops"
          className={`rounded-pill shrink-0 border px-3 py-1.5 text-xs font-medium ${
            category ? 'border-border bg-card' : 'border-primary bg-primary-50 text-primary'
          }`}
        >
          {t('allCategories')}
        </Link>
        {tree.map((parent) => (
          <Link
            key={parent.id}
            href={`/shops?category=${parent.slug}`}
            className={`rounded-pill shrink-0 border px-3 py-1.5 text-xs font-medium ${
              category === parent.slug
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary hover:text-primary'
            }`}
          >
            {pickLocale(parent.name, locale)}
          </Link>
        ))}
      </div>

      <Suspense fallback={<ShopGridSkeleton />}>
        <Directory locale={locale} q={q} category={category} />
      </Suspense>
    </div>
  );
}

async function Directory({
  locale,
  q,
  category,
}: {
  locale: string;
  q?: string;
  category?: string;
}) {
  const t = await getTranslations('shops');
  const term = q?.trim();

  // A search narrows to trigram matches; otherwise the full directory.
  if (term) {
    const results = await searchShops(term, { limit: 30 });
    if (results.length === 0) {
      return (
        <EmptyState
          illustration={<Store className="h-7 w-7" />}
          title={t('noResultsTitle', { term })}
          description={t('noResultsBody')}
          action={{ label: t('clearSearch'), href: '/shops' }}
        />
      );
    }
    return <ShopGrid items={results} />;
  }

  const categoryRow = category ? await categoryBySlug(category) : null;
  const [promoted, organic] = await Promise.all([
    promotedShopsForDirectory(),
    shopDirectory({ locale, categoryId: categoryRow?.id }),
  ]);

  const promotedIds = new Set(promoted.map((shop) => shop.id));
  const rest = organic.filter((shop) => !promotedIds.has(shop.id));

  if (organic.length === 0 && promoted.length === 0) {
    return (
      <EmptyState
        illustration={<Store className="h-7 w-7" />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
        action={{ label: t('allShops'), href: '/shops' }}
      />
    );
  }

  void recordImpressions(promoted.map((shop) => shop.campaignId));

  return (
    <div className="space-y-6">
      {promoted.length > 0 && !categoryRow && (
        <section className="rounded-card border-accent-200 bg-accent-50/40 space-y-3 border p-3">
          <div className="flex items-center gap-2">
            <SponsoredBadge />
            <span className="text-accent-800 text-xs">{t('promotedNote')}</span>
          </div>
          <ShopGrid items={promoted.map((shop) => ({ ...shop, sponsored: true }))} />
        </section>
      )}

      <ShopGrid items={rest} />
    </div>
  );
}
