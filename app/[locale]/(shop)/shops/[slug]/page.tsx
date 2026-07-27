import { Suspense } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Clock, MapPin, PackageSearch, Phone, Store } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { RatingStars } from '@/components/custom/rating-stars';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { ShopSearchBox } from '@/components/shop/shop-search-box';
import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { publicShopProducts, shopCategories } from '@/lib/db/queries/listing';
import { shopDetail } from '@/lib/db/queries/shops';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Shop page (PRD §5.1): banner, logo, derived rating, floor/unit and hours, about,
 * then the shop's own catalogue with its own search and category chips.
 *
 * A shop that is not approved 404s rather than rendering — a pending shop's
 * catalogue must stay invisible until admin flips the switch (PRD §7.1).
 */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { q, category } = await searchParams;
  const t = await getTranslations('shop');

  const shop = await shopDetail(slug);
  if (!shop || shop.status !== 'approved') notFound();

  const categories = await shopCategories(shop.id);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-6">
      {/* Banner */}
      <div className="bg-primary-800 sm:rounded-card relative -mx-4 h-40 overflow-hidden sm:mx-0 sm:mt-4 sm:h-56">
        {shop.bannerPath ? (
          <Image
            src={shop.bannerPath}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        ) : (
          <div className="from-primary-900 to-primary-700 h-full w-full ltr:bg-linear-to-r rtl:bg-linear-to-l" />
        )}
      </div>

      {/* Identity block, logo overlapping the banner */}
      <div className="rounded-card border-border bg-card shadow-card relative -mt-10 flex flex-col gap-3 border p-4 sm:-mt-12 sm:flex-row sm:items-start sm:gap-5">
        <div className="rounded-card border-card bg-primary-100 shadow-card relative h-20 w-20 shrink-0 overflow-hidden border-2">
          {shop.logoPath ? (
            <Image
              src={shop.logoPath}
              alt={pickLocale(shop.name, locale)}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Store className="text-primary-700 h-7 w-7" aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-xl font-bold">{pickLocale(shop.name, locale)}</h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {shop.rating > 0 && (
              <RatingStars value={shop.rating} count={shop.reviewCount} size="sm" />
            )}
            <span className="text-muted-foreground">
              {t('productCount', { count: formatNumber(shop.productCount, locale) })}
            </span>
            {shop.categoryName && (
              <span className="text-muted-foreground">{pickLocale(shop.categoryName, locale)}</span>
            )}
          </div>

          {/* Floor/unit is pickup metadata, not a browsing axis (PRD §4). */}
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
            {shop.floor !== null && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <dd>
                  {t('floorUnit', {
                    floor: formatNumber(shop.floor, locale),
                    unit: shop.unitNumber ?? '—',
                  })}
                </dd>
              </div>
            )}
            {shop.hours && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <dd>{shop.hours}</dd>
              </div>
            )}
            {shop.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <dd dir="ltr">{shop.phone}</dd>
              </div>
            )}
          </dl>

          {shop.description && (
            <p className="text-muted-foreground text-sm">{pickLocale(shop.description, locale)}</p>
          )}
        </div>
      </div>

      {/* The shop's own catalogue */}
      <div className="mt-6 space-y-4">
        <h2 className="text-base font-bold">{t('catalogue')}</h2>

        <ShopSearchBox placeholder={t('searchInShop')} />

        {categories.length > 1 && (
          <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
            <Link
              href={`/shops/${slug}`}
              className={`rounded-pill shrink-0 border px-3 py-1.5 text-xs font-medium ${
                category ? 'border-border bg-card' : 'border-primary bg-primary-50 text-primary'
              }`}
            >
              {t('allProducts')}
            </Link>
            {categories.map((entry) => (
              <Link
                key={entry.id}
                href={`/shops/${slug}?category=${entry.slug}`}
                className={`rounded-pill shrink-0 border px-3 py-1.5 text-xs font-medium ${
                  category === entry.slug
                    ? 'border-primary bg-primary-50 text-primary'
                    : 'border-border bg-card hover:border-primary hover:text-primary'
                }`}
              >
                {pickLocale(entry.name, locale)}
              </Link>
            ))}
          </div>
        )}

        <Suspense fallback={<ProductGridSkeleton count={8} />}>
          <ShopCatalogue shopId={shop.id} slug={slug} q={q} category={category} />
        </Suspense>
      </div>
    </div>
  );
}

async function ShopCatalogue({
  shopId,
  slug,
  q,
  category,
}: {
  shopId: string;
  slug: string;
  q?: string;
  category?: string;
}) {
  const t = await getTranslations('shop');
  const categories = await shopCategories(shopId);
  const categoryId = category ? categories.find((entry) => entry.slug === category)?.id : undefined;

  const [items, user] = await Promise.all([
    publicShopProducts(shopId, { search: q, categoryId }),
    currentUser(),
  ]);

  const saved = await wishlistedProductIds(
    user?.id,
    items.map((item) => item.id),
  );

  if (items.length === 0) {
    return (
      <EmptyState
        illustration={<PackageSearch className="h-7 w-7" />}
        title={q ? t('noMatchTitle', { term: q }) : t('noProductsTitle')}
        description={q ? t('noMatchBody') : t('noProductsBody')}
        action={{ label: t('allProducts'), href: `/shops/${slug}` }}
      />
    );
  }

  return <ProductGrid items={items} savedIds={saved} priority />;
}
