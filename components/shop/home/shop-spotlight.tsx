import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

import { RatingStars } from '@/components/custom/rating-stars';
import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { pickLocale } from '@/lib/db/localized';
import type { shopSpotlight } from '@/lib/db/queries/home';
import { Link } from '@/lib/i18n/navigation';

/**
 * Shop-of-the-week band (PRD §5.1).
 *
 * Where the mockup puts four promo tiles for one tenant, this puts the tenant's
 * banner beside four of its products: the tiles would need artwork a shop has no
 * way to supply in this build, and four empty frames is worse than none. The
 * shop is chosen by rating with a review-count floor, so it is never a one-review
 * artifact — see shopSpotlight().
 */
export async function ShopSpotlight({
  spotlight,
  savedIds,
}: {
  /** Supplied by the page — see DealsRail for why the band does not query. */
  spotlight: NonNullable<Awaited<ReturnType<typeof shopSpotlight>>>;
  savedIds: Set<string>;
}) {
  const locale = await getLocale();
  const t = await getTranslations('home');

  const { shop, items } = spotlight;
  if (items.length === 0) return null;

  return (
    <section className="space-y-5">
      <SectionHeader title={t('shopSpotlight')} href="/shops" />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Link
          href={`/shops/${shop.slug}`}
          className="rounded-card group relative flex min-h-[240px] flex-col justify-end overflow-hidden p-6"
        >
          {shop.bannerPath ? (
            <Image
              src={shop.bannerPath}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 400px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="from-primary-800 to-primary-600 absolute inset-0 bg-linear-to-br" />
          )}

          {/* Physical gradient: the copy is anchored to the bottom in both
              directions, so this one does not mirror. */}
          <div className="from-neutral-900/85 absolute inset-0 bg-linear-to-t to-transparent" />

          <span className="text-primary-foreground relative flex flex-col gap-2">
            <span className="text-2xl leading-tight font-extrabold">
              {pickLocale(shop.name, locale)}
            </span>
            {shop.description && (
              <span className="clamp-2 text-primary-200 text-sm">
                {pickLocale(shop.description, locale)}
              </span>
            )}
            <span className="mt-1 flex items-center gap-3">
              <RatingStars value={shop.rating} count={shop.reviewCount} size="sm" />
            </span>
            <span className="text-primary-300 mt-2 flex items-center gap-1 text-sm font-bold">
              {t('spotlightVisit')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </span>
          </span>
        </Link>

        <ProductGrid items={items} savedIds={savedIds} />
      </div>
    </section>
  );
}

export function ShopSpotlightSkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Skeleton className="rounded-card min-h-[240px]" />
        <ProductGridSkeleton count={4} />
      </div>
    </section>
  );
}
