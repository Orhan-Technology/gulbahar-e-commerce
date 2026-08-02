import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Star } from 'lucide-react';

import { WriteReviewDialog } from '@/components/shop/product/write-review-dialog';
import { pickLocale } from '@/lib/db/localized';
import { reviewableItemsForOrder } from '@/lib/db/queries/reviews';
import { Link } from '@/lib/i18n/navigation';

/**
 * "Rate what you bought" on a fulfilled order (Prompt: per-product review
 * prompt).
 *
 * THE HIGHEST-YIELD MOMENT THERE IS. Reviews are this marketplace's scarcest
 * asset, and every catalogue that has solved the cold-start problem solved it
 * here: not by asking a shopper who happens to wander back to a product page,
 * but by asking the person holding the thing, on the screen that already knows
 * they bought it.
 *
 * DISTINCT FROM RateShopsPrompt, which sits beside it. That one asks how the
 * SHOP handled the order — whether the phone was answered, whether it was ready
 * when they said. This asks whether the ITEM was any good. They are different
 * questions with different audiences: the first shapes a shop's rating, the
 * second is what the next buyer reads on the product page.
 *
 * IT ENFORCES NOTHING OF ITS OWN. `reviewableItemsForOrder` applies exactly the
 * rules `submitReview` re-checks — a fulfilled order line belonging to this
 * customer, not already reviewed, one review per customer per product, and no
 * archived product — so this prompt can only offer what the action would accept.
 * Hiding a row is a courtesy; the action is the rule (PRD §5.5).
 *
 * GONE once everything is reviewed, rather than becoming a receipt that says
 * "you have reviewed these".
 */
export async function OrderItemReviewPrompt({
  orderId,
  userId,
}: {
  orderId: string;
  userId: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('orders.rateItems');

  const items = await reviewableItemsForOrder(orderId, userId);
  if (items.length === 0) return null;

  return (
    <section className="rounded-card border-primary-200 bg-primary-50/60 space-y-3 border p-4">
      <div className="flex items-start gap-2.5">
        <Star className="text-accent-warm fill-accent-warm mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-0.5">
          <h2 className="text-sm font-bold">{t('title')}</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">{t('body')}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.productId}
            className="rounded-control border-border bg-card flex flex-wrap items-center gap-3 border p-2.5"
          >
            {/* The PHOTO, not just the name: a customer who bought four things
                recognises the picture faster than the title, and the row has to
                be identifiable at a glance to be worth answering. */}
            <Link
              href={`/products/${item.productSlug}`}
              className="rounded-control relative h-11 w-11 shrink-0 overflow-hidden bg-neutral-100"
            >
              {item.imagePath && (
                <Image src={item.imagePath} alt="" fill sizes="44px" className="object-cover" />
              )}
            </Link>

            <Link
              href={`/products/${item.productSlug}`}
              className="hover:text-primary min-w-0 flex-1 truncate text-sm font-medium"
            >
              {pickLocale(item.productTitle, locale)}
            </Link>

            {/* The same dialog the product page uses — one review composer, so
                the rating control and the copy cannot drift between the two
                places a review is written. */}
            <WriteReviewDialog productSlug={item.productSlug} size="sm" variant="outline" />
          </li>
        ))}
      </ul>
    </section>
  );
}
