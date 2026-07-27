import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { PriceDisplay } from '@/components/custom/price-display';
import { RatingStars } from '@/components/custom/rating-stars';
import { MoveToCartButton } from '@/components/shop/account/move-to-cart-button';
import { WishlistButton } from '@/components/shop/wishlist-button';
import { requireUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistForUser } from '@/lib/db/queries/home';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/** Wishlist (PRD §5.6): live price and stock, with move-to-cart. */
export default async function WishlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('wishlist');

  const session = await requireUser(locale);
  const items = await wishlistForUser(session.id);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          illustration={<Heart className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('browseProducts'), href: '/products' }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">
        {t('title')} · {formatNumber(items.length, locale)}
      </h1>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const unavailable = item.status !== 'published' || item.stock <= 0;
          return (
            <li
              key={item.id}
              className="rounded-card border-border bg-card shadow-card flex flex-col overflow-hidden border"
            >
              <div className="relative">
                <Link
                  href={`/products/${item.slug}`}
                  className="relative block aspect-square bg-neutral-100"
                >
                  {item.imagePath && (
                    <Image
                      src={item.imagePath}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, 240px"
                      className="object-cover"
                    />
                  )}
                </Link>
                <div className="absolute end-2 top-2">
                  <WishlistButton productId={item.id} initialSaved />
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <Link
                  href={`/products/${item.slug}`}
                  className="clamp-2 hover:text-primary text-sm font-medium"
                >
                  {pickLocale(item.title, locale)}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {pickLocale(item.shopName, locale)}
                </p>

                {item.rating > 0 && (
                  <RatingStars value={item.rating} count={item.reviewCount} size="sm" />
                )}

                <PriceDisplay price={item.price} discountPrice={item.discountPrice} size="md" />

                {/* Live stock, which is the whole point of revisiting a wishlist */}
                {unavailable ? (
                  <p className="text-danger text-xs font-medium">{t('outOfStock')}</p>
                ) : item.stock <= 5 ? (
                  <p className="text-warning-fg text-xs font-medium">
                    {t('onlyLeft', { count: formatNumber(item.stock, locale) })}
                  </p>
                ) : (
                  <p className="text-success text-xs">{t('inStock')}</p>
                )}

                <div className="mt-auto pt-2">
                  <MoveToCartButton productId={item.id} disabled={unavailable} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
