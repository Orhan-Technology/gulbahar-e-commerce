import { getLocale, getTranslations } from 'next-intl/server';
import { Tag, Ticket } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { ProductGrid } from '@/components/shop/product-grid';
import { pickLocale } from '@/lib/db/localized';
import { productsByIds } from '@/lib/db/queries/rails';
import { shopActiveOffers } from '@/lib/db/queries/shop-page';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A shop's live discounts (Prompt C8).
 *
 * Each offer shows WHAT IT APPLIES TO, not just its headline. A card reading
 * "20% off" with nothing under it makes the reader open the catalogue and guess
 * which products are in the sale; a shop-wide offer says so in one line, and a
 * product-scoped offer shows the products.
 *
 * These carry NO Sponsored badge. The shop is giving up its own margin here,
 * which is the opposite of buying position — conflating the two would teach a
 * shopper to distrust a genuine discount (PRD §8.1 vs §8.2).
 *
 * The EMPTY STATE explains what an offer is rather than apologising. Someone
 * who lands on this tab of a shop with no sale on has learned something useful
 * — this shop runs them, follow it and you will hear — and that is a better use
 * of the space than "no results".
 */
export async function OffersTab({ shopId, shopSlug }: { shopId: string; shopSlug: string }) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.offers');
  const tCommon = await getTranslations('common');

  // `now` is read once, here on the server, and handed to the query.
  const offers = await shopActiveOffers(shopId, new Date());

  if (offers.length === 0) {
    return (
      <EmptyState
        illustration={<Ticket className="h-7 w-7" aria-hidden />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
        action={{ label: t('emptyAction'), href: `/shops/${shopSlug}` }}
      />
    );
  }

  const scopedProducts = await Promise.all(
    offers.map((offer) =>
      offer.scope === 'products' && offer.productIds?.length
        ? productsByIds(offer.productIds.slice(0, 8))
        : Promise.resolve([]),
    ),
  );

  return (
    <div className="space-y-6">
      {offers.map((offer, index) => {
        const items = scopedProducts[index];
        /*
         * THE PANEL IS AS WIDE AS WHAT IS IN IT.
         *
         * A shop with one product in its sale got a full-bleed pink block with a
         * single card in the corner and seven hundred pixels of tinted nothing
         * beside it — which reads as content that failed to load, on the tab
         * whose whole job is to look like a bargain. The width follows the
         * count, and only a real rail's worth of products earns the full page.
         */
        const wide = items.length >= 4;

        return (
        <section
          key={offer.id}
          className={cn(
            'rounded-card border-accent-200 bg-accent-50/60 space-y-4 border p-4',
            !wide && 'sm:max-w-xl',
            items.length === 3 && 'sm:max-w-3xl',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {/* `dir="auto"`: the offer's name is the shopkeeper's own text,
                  and a Latin one inheriting RTL loses its punctuation. */}
              <h2
                dir="auto"
                className="text-accent-900 flex items-center gap-2 text-base font-bold"
              >
                <Tag className="h-4 w-4 shrink-0" aria-hidden />
                {pickLocale(offer.name, locale)}
              </h2>
              <p className="text-accent-800/80 text-xs">
                {offer.scope === 'shop'
                  ? t('scopeShop')
                  : t('scopeProducts', { count: offer.productIds?.length ?? 0 })}
                {' · '}
                {t('until', { date: formatDate(offer.endsAt, locale, 'medium') })}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              {/* THE WORD, not «؋» — a discount is a statement about money, and
                  the symbol is reserved for dense numeric controls. The rule is
                  written out in components/shop/home/offer-showcase.tsx. */}
              <span className="rounded-pill bg-accent text-accent-foreground px-3 py-1 text-sm font-bold">
                {offer.type === 'percent'
                  ? formatPercent(offer.value / 100, locale)
                  : `${formatNumber(offer.value, locale)} ${tCommon('currencyWord')}`}
              </span>
              {/* The live countdown, the same component the home strip uses —
                  a discount with a deadline is only urgent if it is counting. */}
              <OfferCountdown endsAt={offer.endsAt.toISOString()} className="text-accent-800" />
            </div>
          </div>

          {items.length > 0 && (
            /*
             * A RAIL only once there is enough to scroll. A rail exists to
             * promise more off the edge of the screen, and one card sitting in
             * a quarter of the width with nothing beside it makes the same
             * promise and breaks it. Below four the grid is capped to two
             * columns so a card keeps a card's proportions inside the narrower
             * panel rather than shrinking to a thumbnail.
             */
            <ProductGrid
              items={items}
              layout={wide ? 'row' : 'grid'}
              className={wide ? undefined : 'sm:grid-cols-2 lg:grid-cols-2'}
              railLabel={pickLocale(offer.name, locale)}
              quickAdd
            />
          )}
        </section>
        );
      })}
    </div>
  );
}
