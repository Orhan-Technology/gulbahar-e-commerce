import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Store } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { RatingStars } from '@/components/custom/rating-stars';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export interface ShopCardProps {
  slug: string;
  name: string;
  categoryName?: string;
  rating?: number;
  reviewCount?: number;
  productCount?: number;
  floor?: number | null;
  unitNumber?: string | null;
  logoPath?: string | null;
  bannerPath?: string | null;
  isSponsored?: boolean;
  className?: string;
}

/**
 * Shop directory and featured-carousel card (PRD §5.1, §10.4).
 *
 * Floor and unit are metadata here rather than a browsing axis (PRD §4) — they
 * matter for in-store pickup, so they are shown but never emphasised.
 */
export function ShopCard({
  slug,
  name,
  categoryName,
  rating,
  reviewCount,
  productCount,
  floor,
  unitNumber,
  logoPath,
  bannerPath,
  isSponsored = false,
  className,
}: ShopCardProps) {
  const locale = useLocale();
  const t = useTranslations('shop');

  const hasLocation = floor !== null && floor !== undefined;

  return (
    <Link
      href={`/shops/${slug}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow duration-fast hover:shadow-overlay',
        className,
      )}
    >
      {/* Banner strip */}
      <div className="relative h-20 bg-gradient-to-br from-primary-700 to-primary-900">
        {bannerPath && (
          <Image
            src={bannerPath}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className="object-cover"
          />
        )}
        {isSponsored && (
          <div className="absolute end-2 top-2">
            <SponsoredBadge />
          </div>
        )}
      </div>

      <div className="relative px-3 pb-3">
        {/* Logo overlaps the banner edge */}
        <div className="relative -mt-6 mb-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded-control border-2 border-card bg-primary-100 shadow-card">
          {logoPath ? (
            <Image src={logoPath} alt={name} fill sizes="48px" className="object-cover" />
          ) : (
            <Store className="h-5 w-5 text-primary-700" aria-hidden />
          )}
        </div>

        <h3 className="clamp-1 text-sm font-semibold text-foreground">{name}</h3>
        {categoryName && <p className="truncate text-xs text-muted-foreground">{categoryName}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {rating !== undefined && rating > 0 && (
            <RatingStars value={rating} count={reviewCount} size="sm" />
          )}
          {productCount !== undefined && (
            <span className="text-xs text-muted-foreground">
              {t('productCount', { count: formatNumber(productCount, locale) })}
            </span>
          )}
        </div>

        {hasLocation && (
          <p className="mt-1.5 text-xs text-neutral-500">
            {t('floorUnit', {
              floor: formatNumber(floor, locale),
              unit: unitNumber ?? '—',
            })}
          </p>
        )}
      </div>
    </Link>
  );
}

ShopCard.Skeleton = function ShopCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card',
        className,
      )}
    >
      <Skeleton className="h-20 w-full rounded-none" />
      <div className="px-3 pb-3">
        <Skeleton className="-mt-6 mb-2 h-12 w-12 rounded-control" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-1.5 h-3 w-20" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
    </div>
  );
};
