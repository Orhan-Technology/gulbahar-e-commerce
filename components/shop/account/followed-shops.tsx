import { getLocale, getTranslations } from 'next-intl/server';
import { Heart } from 'lucide-react';

import { ShopCard } from '@/components/custom/shop-card';
import { pickLocale } from '@/lib/db/localized';
import { followedShops } from '@/lib/db/queries/shop-page';
import { Link } from '@/lib/i18n/navigation';

/**
 * The shops this customer follows, on the account hub (Prompt C8).
 *
 * ROWS, NOT BANNERS. The hub is already a page of cards, and eight shop banners
 * here would out-shout the customer's own orders and wishlist. The directory's
 * compact row form says the same things in a quarter of the height.
 *
 * RENDERS NOTHING WHEN EMPTY, unlike the account sections above it. Those are
 * permanent parts of the account and an empty one still needs a door; following
 * is optional, and a "you follow no shops" panel on every visit would be a
 * standing reproach for not using a feature.
 */
export async function FollowedShops({ userId }: { userId: string }) {
  const locale = await getLocale();
  const t = await getTranslations('account.following');

  const shops = await followedShops(userId);
  if (shops.length === 0) return null;

  return (
    <section aria-labelledby="followed-shops-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="followed-shops-heading" className="flex items-center gap-2 text-base font-bold">
          <Heart className="text-primary h-4 w-4" aria-hidden />
          {t('title')}
        </h2>
        <Link href="/shops" className="text-primary text-xs font-medium hover:underline">
          {t('browse')}
        </Link>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {shops.map((shop) => (
          <li key={shop.id}>
            <ShopCard
              slug={shop.slug}
              name={pickLocale(shop.name, locale)}
              productCount={shop.productCount}
              floor={shop.floor}
              unitNumber={shop.unitNumber}
              logoPath={shop.logoPath}
              bannerPath={shop.bannerPath}
              verifiedAt={shop.verifiedAt ? shop.verifiedAt.toISOString() : null}
              layout="row"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
