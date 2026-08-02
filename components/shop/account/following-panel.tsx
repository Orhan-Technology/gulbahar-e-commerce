import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarClock, Heart, MapPin, Sparkles, Store, Tag } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductGrid } from '@/components/shop/product-grid';
import { VerifiedBadge } from '@/components/shop/verified-badge';
import { pickLocale } from '@/lib/db/localized';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { followedShopsFeed } from '@/lib/db/queries/shop-page';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatUnitNumber,
} from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { pauseState } from '@/lib/pause';

/**
 * "Shops you follow", with something in it (Prompt: follow is a dead loop).
 *
 * FOLLOWING USED TO GO NOWHERE. The button wrote a row, the hero counted it,
 * and no surface anywhere ever mentioned a followed shop again — so the feature
 * asked for a commitment and returned nothing, which is worse than not offering
 * it. This screen is the return: for each shop, what it has added since the day
 * you followed it and what it is discounting today.
 *
 * ONE BLOCK PER SHOP, not a merged feed. A merged feed would need a ranking to
 * be honest about — and with fourteen tenants there is nothing to rank — while
 * the per-shop form keeps the relationship visible, which is the thing the
 * customer actually opted into.
 *
 * A PAUSED SHOP STILL APPEARS, badged. Hiding it would answer "where did that
 * shop go" with silence, and the shopkeeper is back on a named day.
 */
export async function FollowingPanel({ userId, now }: { userId: string; now: Date }) {
  const locale = await getLocale();
  const t = await getTranslations('account.following');
  const tShop = await getTranslations('shop');

  const feed = await followedShopsFeed(userId, now);

  if (feed.length === 0) {
    return (
      <EmptyState
        illustration={<Heart className="h-7 w-7" aria-hidden />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
        action={{ label: t('browse'), href: '/shops' }}
      />
    );
  }

  const saved = await wishlistedProductIds(
    userId,
    feed.flatMap((shop) => shop.products.map((product) => product.id)),
  );

  return (
    <div className="space-y-6">
      {feed.map((shop) => {
        const name = pickLocale(shop.name, locale);
        const paused = pauseState(shop.pausedUntil, now);

        return (
          <section
            key={shop.id}
            className="rounded-card border-border bg-card shadow-card space-y-4 border p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/shops/${shop.slug}`}
                className="rounded-control bg-primary-100 relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden"
              >
                {shop.logoPath ? (
                  <Image
                    src={shop.logoPath}
                    alt={name}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <Store className="text-primary-700 h-5 w-5" aria-hidden />
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-1.5 text-sm font-bold">
                  <Link href={`/shops/${shop.slug}`} className="hover:text-primary truncate">
                    {name}
                  </Link>
                  <VerifiedBadge
                    verifiedAt={shop.verifiedAt ? shop.verifiedAt.toISOString() : null}
                    size="sm"
                  />
                </h2>
                {shop.floor !== null && (
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                    {tShop('floorUnit', {
                      floor: formatNumber(shop.floor, locale),
                      unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                    })}
                  </p>
                )}
              </div>

              {/* NEW SINCE YOU FOLLOWED, not "new" in the abstract. A shop that
                  listed three things the day after you followed it is news; the
                  same three products are not news to someone who followed
                  today. */}
              {shop.newSinceFollow > 0 && (
                <span className="rounded-pill bg-success-bg text-success text-2xs inline-flex shrink-0 items-center gap-1 px-2 py-1 font-semibold">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {t('newSince', { count: formatNumber(shop.newSinceFollow, locale) })}
                </span>
              )}

              {paused?.paused && (
                <span className="rounded-pill bg-warning-bg text-warning-fg text-2xs inline-flex shrink-0 items-center gap-1 px-2 py-1 font-medium">
                  <CalendarClock className="h-3 w-3" aria-hidden />
                  {tShop('pausedBadge', { date: formatDate(paused.until, locale, 'medium') })}
                </span>
              )}
            </div>

            {/* The live offers, as chips — the single most actionable thing a
                followed shop can be doing right now. */}
            {shop.offers.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {shop.offers.map((offer) => (
                  <li key={offer.id}>
                    <Link
                      href={`/shops/${shop.slug}?tab=offers`}
                      className="rounded-pill border-accent-200 bg-accent-50 text-accent-900 hover:border-accent inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium"
                    >
                      <Tag className="h-3 w-3 shrink-0" aria-hidden />
                      {pickLocale(offer.name, locale)}
                      <span className="font-bold">
                        {offer.type === 'percent'
                          ? formatPercent(offer.value / 100, locale)
                          : formatCurrency(offer.value, locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {shop.products.length > 0 ? (
              <ProductGrid items={shop.products} savedIds={saved} />
            ) : (
              <p className="text-muted-foreground text-sm">{t('noProducts')}</p>
            )}

            <Link
              href={`/shops/${shop.slug}`}
              className="text-primary inline-block text-xs font-medium hover:underline"
            >
              {t('visitShop', { shop: name })}
            </Link>
          </section>
        );
      })}
    </div>
  );
}

/** NAMED export — never a static on the component (CLAUDE.md). */
export function FollowingPanelSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="rounded-card border-border bg-card space-y-4 border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="rounded-control h-12 w-12 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, card) => (
              <Skeleton key={card} className="rounded-card h-56 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
