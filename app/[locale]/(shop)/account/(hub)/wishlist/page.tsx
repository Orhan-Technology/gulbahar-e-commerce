import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { ProductCard } from '@/components/custom/product-card';
import { MoveToCartButton } from '@/components/shop/account/move-to-cart-button';
import { WishlistButton } from '@/components/shop/wishlist-button';
import { requireUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistForUser } from '@/lib/db/queries/home';
import { formatNumber } from '@/lib/format';

/**
 * Wishlist (PRD §5.6).
 *
 * The SAME CARD as the storefront, not a bespoke list. It had its own layout —
 * its own image box, its own title link, its own price line, its own stock
 * message — which meant every improvement to the product card stopped at the
 * account boundary, and the wishlist visibly aged relative to the shop it was
 * saved from. Anything that is a product should look like one.
 *
 * What is genuinely different here is added AROUND the card rather than by
 * rebuilding it: the heart arrives pre-filled, and each card carries a
 * move-to-cart action, because a wishlist is a list of intentions and the whole
 * reason to come back is to act on one.
 */
export default async function WishlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('wishlist');

  const session = await requireUser(locale);
  const items = await wishlistForUser(session.id);

  if (items.length === 0) {
    return (
      <div className="py-6">
        <EmptyState
          illustration={<Heart className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('browseProducts'), href: '/products' }}
        />
      </div>
    );
  }

  // The hub layout owns the page frame (Prompt A2).
  return (
    <div className="space-y-4">
      {/*
        The count is a SUBTITLE, not part of the title. It used to be
        «علاقه‌مندی‌ها · ۴», and a middle dot immediately before a Persian
        numeral reads as «۰» in Vazirmatn — so a list of four looked like a list
        of forty. Two elements need no separator glyph at all.
      */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <span className="text-muted-foreground text-sm tabular-nums">
          {t('itemCount', { count: formatNumber(items.length, locale) })}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-3">
            <ProductCard
              slug={item.slug}
              title={pickLocale(item.title, locale)}
              shopName={pickLocale(item.shopName, locale)}
              price={item.price}
              discountPrice={item.discountPrice}
              rating={item.rating}
              reviewCount={item.reviewCount}
              imagePath={item.imagePath}
              stock={item.stock}
              // Live stock is why anyone revisits a wishlist, and the card
              // already says it — out-of-stock desaturates and overlays,
              // three-or-fewer shows the scarcity chip.
              wishlistSlot={<WishlistButton productId={item.id} initialSaved />}
            />

            <MoveToCartButton productId={item.id} disabled={item.stock <= 0} />
          </li>
        ))}
      </ul>
    </div>
  );
}
