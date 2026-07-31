import { getLocale, getTranslations } from 'next-intl/server';
import { Star } from 'lucide-react';

import { WriteShopReviewDialog } from '@/components/shop/shop-page/write-shop-review-dialog';
import { pickLocale } from '@/lib/db/localized';
import { reviewableShopsForOrder } from '@/lib/db/queries/shop-page';

/**
 * "How was it?" on a fulfilled order (Prompt C8).
 *
 * ASKED HERE, not on the shop page, because this is the screen that knows the
 * answer is worth asking for: the order is done, the customer is looking at it,
 * and the shop that handled it is named on the page. A shop page can only offer
 * the form to someone who happens to visit it afterwards, which is almost
 * nobody.
 *
 * ONE ROW PER SHOP. A basket that crossed three shops on two floors gets three
 * prompts, because three different people packed three different bags — and a
 * single rating for "the order" would average away the one that kept you
 * waiting.
 *
 * Rendered only for fulfilled orders with something left to review, and gone
 * the moment the review is posted. A panel that stays behind saying "you have
 * reviewed this" is a receipt nobody asked for.
 */
export async function RateShopsPrompt({
  orderId,
  orderReference,
  userId,
}: {
  orderId: string;
  orderReference: string;
  userId: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('orders.rateShops');

  const shops = await reviewableShopsForOrder(orderId, userId);
  if (shops.length === 0) return null;

  return (
    <section className="rounded-card border-accent-200 bg-accent-50/60 space-y-3 border p-4">
      <div className="flex items-start gap-2.5">
        <Star className="text-accent-warm fill-accent-warm mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-0.5">
          <h2 className="text-sm font-bold">{t('title')}</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">{t('body')}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {shops.map((shop) => (
          <li
            key={shop.shopId}
            className="rounded-control border-border bg-card flex flex-wrap items-center justify-between gap-2 border p-2.5"
          >
            <span className="min-w-0 truncate text-sm font-medium">
              {pickLocale(shop.shopName, locale)}
            </span>
            <WriteShopReviewDialog
              shopId={shop.shopId}
              orderReference={orderReference}
              variant="outline"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
