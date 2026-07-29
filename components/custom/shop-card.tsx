import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Store } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingStars } from '@/components/custom/rating-stars';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { formatNumber, formatRating, formatUnitNumber } from '@/lib/format';
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
  /**
   * `card` is the banner-and-logo tile. `row` is the mall directory's compact
   * form — a monogram disc beside the name and one line of metadata — which is
   * how the mockup lists eight shops in two tidy rows instead of eight banners
   * competing with the product photography above them.
   */
  layout?: 'card' | 'row';
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
  layout = 'card',
  className,
}: ShopCardProps) {
  const locale = useLocale();
  const t = useTranslations('shop');
  const common = useTranslations('common');

  const hasLocation = floor !== null && floor !== undefined;

  if (layout === 'row') {
    return (
      <Link
        href={`/shops/${slug}`}
        className={cn(
          pressable,
          'rounded-media group flex items-center gap-4 bg-neutral-50 p-4 transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-100',
          className,
        )}
      >
        {/* 48px, not the mockup's 52: 52 is off our 4/8/12/16 spacing scale and
            the difference is invisible beside a 16px pad. */}
        <span className="rounded-pill bg-card relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden">
          {logoPath ? (
            <Image src={logoPath} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <Store className="text-primary h-5 w-5" aria-hidden />
          )}
        </span>

        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <span className="text-foreground group-hover:text-primary truncate text-base font-bold transition-colors duration-150">
              {name}
            </span>
            {isSponsored && <SponsoredBadge tone="inline" />}
          </span>

          {/*
           * One metadata line, in the order a mall customer reads it: how good,
           * how much, and where to walk. The mockup's "delivery within 24h" is
           * not here — there is no per-shop SLA in the data, and inventing one
           * would be a promise the shop never made.
           */}
          {/*
            The rating is the COMPONENT, not a ★ glyph spliced into a sentence.
            A star character renders at whatever weight and baseline the active
            face gives it — and Vazirmatn's is a lumpy asterisk — so the same
            rating looked like a different mark in Dari and English.
          */}
          <span className="flex min-w-0 items-center gap-2 text-xs text-neutral-500">
            {rating !== undefined && rating > 0 && (
              <>
                <RatingStars value={rating} size="sm" />
                <span className="tabular-nums">{formatRating(rating, locale)}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="truncate">
              {[
                productCount !== undefined
                  ? t('productCount', { count: formatNumber(productCount, locale) })
                  : null,
                hasLocation ? common('floorName', { floor }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/shops/${slug}`}
      className={cn(
        pressable,
        // The lift is `translate`, not a bigger shadow alone: a card that only
        // brightens reads as a hover state, one that rises reads as pickable.
        'group rounded-card border-border bg-card shadow-card hover:shadow-overlay flex flex-col overflow-hidden border transition-[box-shadow,translate,scale] duration-150 ease-out hover:-translate-y-0.5',
        className,
      )}
    >
      {/* Banner strip */}
      <div className="from-primary-700 to-primary-900 relative h-20 bg-linear-to-br">
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
        <div className="rounded-control border-card bg-primary-100 shadow-card relative -mt-6 mb-2 flex h-12 w-12 items-center justify-center overflow-hidden border-2">
          {logoPath ? (
            <Image src={logoPath} alt={name} fill sizes="48px" className="object-cover" />
          ) : (
            <Store className="text-primary-700 h-5 w-5" aria-hidden />
          )}
        </div>

        <h3 className="clamp-1 text-foreground text-sm font-semibold">{name}</h3>
        {categoryName && <p className="text-muted-foreground truncate text-xs">{categoryName}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {rating !== undefined && rating > 0 && (
            <RatingStars value={rating} count={reviewCount} size="sm" />
          )}
          {productCount !== undefined && (
            <span className="text-muted-foreground text-xs">
              {t('productCount', { count: formatNumber(productCount, locale) })}
            </span>
          )}
        </div>

        {/*
          Floor and unit as a neutral BADGE, not a line of text. It is metadata
          for someone planning to walk there (PRD §4) and never a browsing axis,
          so it should read as a label on the card rather than as one more
          sentence competing with the rating and the product count.
        */}
        {hasLocation && (
          <span className="rounded-pill mt-2 inline-flex items-center gap-1 bg-neutral-100 px-2 py-1 text-2xs font-medium text-neutral-600">
            <MapPin className="h-3 w-3" aria-hidden />
            {t('floorUnit', {
              floor: formatNumber(floor, locale),
              unit: formatUnitNumber(unitNumber, locale) || '—',
            })}
          </span>
        )}
      </div>
    </Link>
  );
}

export function ShopCardSkeleton({
  layout = 'card',
  className,
}: {
  layout?: 'card' | 'row';
  className?: string;
}) {
  if (layout === 'row') {
    return (
      <div className={cn('rounded-media flex items-center gap-4 bg-neutral-50 p-4', className)}>
        <Skeleton className="rounded-pill h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-card border-border bg-card shadow-card flex flex-col overflow-hidden border',
        className,
      )}
    >
      <Skeleton className="h-20 w-full rounded-none" />
      <div className="px-3 pb-3">
        <Skeleton className="rounded-control -mt-6 mb-2 h-12 w-12" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-1.5 h-3 w-20" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and ShopCard.Skeleton reads as undefined. Server code
 * must import ShopCardSkeleton directly.
 */
ShopCard.Skeleton = ShopCardSkeleton;
