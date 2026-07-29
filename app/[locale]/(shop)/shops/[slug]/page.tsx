import { Suspense } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Clock, MapPin, Phone, Store } from 'lucide-react';

import { RatingStars } from '@/components/custom/rating-stars';
import { SearchBox } from '@/components/custom/search-box';
import { FacetControls } from '@/components/shop/listing/facet-controls';
import {
  ProductListing,
  ProductListingSkeleton,
  type ListingSearchParams,
} from '@/components/shop/listing/product-listing';
import { pickLocale } from '@/lib/db/localized';
import { filterFacets } from '@/lib/db/queries/listing';
import { categoryTree, shopDetail } from '@/lib/db/queries/shops';
import { formatNumber, formatOpeningHours, formatUnitNumber } from '@/lib/format';
import { decodeSlug } from '@/lib/utils';

/**
 * Shop page (PRD §5.1): banner, logo, derived rating, floor/unit and hours,
 * about — and then A CATEGORY PAGE.
 *
 * The catalogue below the header is the same listing component as /categories
 * and /search, scoped to this shop: same toolbar, same sort, same facets, same
 * applied-filter chips, same load-more. It used to be a bare grid with an
 * in-shop search and a chip row of its own, which meant a shopper who had
 * learned how to narrow a category page had to learn something else the moment
 * they stepped into a shop.
 *
 * The SHOP facet is hidden here — on this page it can only navigate away from
 * the shop the page is about.
 *
 * A shop that is not approved 404s rather than rendering — a pending shop's
 * catalogue must stay invisible until admin flips the switch (PRD §7.1).
 */
export default async function ShopPage({
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
  const t = await getTranslations('shop');

  const shop = await shopDetail(slug);
  if (!shop || shop.status !== 'approved') notFound();

  const [facets, tree] = await Promise.all([filterFacets(locale), categoryTree(locale)]);
  const facetOptions = {
    ...facets,
    categories: tree,
    hide: ['shop'] as Array<'category' | 'shop'>,
  };

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
                    unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                  })}
                </dd>
              </div>
            )}
            {shop.hours && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <dd>{formatOpeningHours(shop.hours, locale)}</dd>
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

      {/* The shop's own catalogue — the same listing as everywhere else */}
      <div className="mt-6 space-y-4">
        <h2 className="text-base font-bold">{t('catalogue')}</h2>

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
                scope={{ shopIds: [shop.id] }}
                emptyHref={`/shops/${slug}`}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
