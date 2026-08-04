import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Store, Tag } from 'lucide-react';

import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocale } from '@/lib/db/localized';
import { activeOffers } from '@/lib/db/queries/home';
import { formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The deals band on /offers (PRD §5.1, §8.1).
 *
 * It was a flat rail of pale text-only tiles — a headline, a shop name and a
 * number — on the one page in the store whose entire subject is a discount. On
 * every marketplace a shopper has used, deals are the most visually charged
 * surface there is, and the cost of underselling them here is not aesthetic:
 * the page reads as a list of coupons rather than as somewhere to buy.
 *
 * So: PHOTOGRAPHY, and a LEAD. One offer is given the large card, and it is
 * chosen by the only honest criterion available — the one that expires first,
 * which activeOffers already orders by. There is no invented "deal of the day",
 * no fabricated deadline and no urgency the data does not support; the clock on
 * each card is that offer's real `endsAt`, and a card whose offer has ended says
 * so rather than counting into the negative.
 *
 * Discounts here are SHOP-FUNDED, so no Sponsored badge: the shop is giving up
 * margin rather than buying position (PRD §8.1 vs §8.2). Paid placement is the
 * strip inside the listing below, which is badged.
 */
export async function OfferShowcase({ limit = 7 }: { limit?: number }) {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const tOffers = await getTranslations('offers');
  const tCategories = await getTranslations('categories');
  const tCommon = await getTranslations('common');
  const offers = await activeOffers(limit);

  if (offers.length === 0) return null;

  const [lead, ...rest] = offers;

  /*
   * ONE CURRENCY NOTATION, AND THIS PAGE HAD TWO.
   *
   * A campaign card's discount read «؋۷۸۵» while the product card six pixels
   * below it read «۲٬۴۰۰ افغانی» — the same fact, money in afghanis, written
   * two different ways inside one viewport, and the symbol is the one an Afghan
   * reader meets least often. The rule this file, the home hero and the shop's
   * offers tab now share:
   *
   *   THE WORD wherever the money is a statement — a price, a discount, a
   *   threshold. That is how every ProductCard in the storefront already
   *   writes it, and it is what the page has most of.
   *   THE SYMBOL only in dense numeric CONTROLS, where the amount is an axis
   *   label rather than a sentence: the price-band chips and the price range in
   *   the applied-filter row, both of which have four of them side by side.
   *
   * A percentage is neither — «٪۲۵» is the same in both registers.
   */
  const badge = (offer: (typeof offers)[number]) =>
    offer.type === 'percent'
      ? formatPercent(offer.value / 100, locale)
      : `${formatNumber(offer.value, locale)} ${tCommon('currencyWord')}`;

  /*
   * HOW MUCH IS IN THE SALE. «۲۵٪ تخفیف» over a shop name could mean one
   * clearance item or the whole floor, and the difference is the reason someone
   * taps or does not. Counted in the query, so a shop-wide offer says the size
   * of the catalogue and a product-scoped one says the size of its own list.
   *
   * Null at zero, never «۰ محصول»: a bare zero on a promotional card reads as a
   * broken counter, and an offer whose product list is empty is better described
   * by its name and its deadline than by the size of nothing.
   */
  const productCount = (offer: (typeof offers)[number]) => {
    const total = Number(offer.productCount);
    return total > 0
      ? tCategories('productCount', { count: formatNumber(total, locale) })
      : null;
  };

  return (
    <section className="space-y-4" aria-labelledby="offers-showcase">
      <h2 id="offers-showcase" className="text-lg font-bold">
        {t('activeOffers')}
      </h2>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        {/* THE LEAD. Twice the height of a follower and the only one that shows
            its photograph uncropped by a card border. */}
        <Link
          href={`/shops/${lead.shopSlug}`}
          className="pressable rounded-panel shadow-card hover:shadow-overlay group relative flex min-h-64 flex-col justify-end overflow-hidden transition-[box-shadow,scale] duration-150 ease-out"
        >
          {lead.imagePath ? (
            <Image
              src={lead.imagePath}
              alt=""
              fill
              sizes="(min-width: 1024px) 640px, 100vw"
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
              priority
            />
          ) : (
            <span className="bg-accent-100 absolute inset-0" aria-hidden />
          )}

          {/*
            A scrim, not a tint: the copy sits on a photograph we do not
            control, and only an opaque-at-the-bottom gradient guarantees the
            contrast ratio whatever the shot happens to be. Physical direction
            because a vertical gradient has no logical mirror (CLAUDE.md).
          */}
          <span
            aria-hidden
            className="absolute inset-0 bg-linear-to-t from-neutral-950/85 via-neutral-950/35 to-transparent"
          />

          {/*
            `flex flex-col` rather than `space-y`: every child here is a <span>
            inside an <a>, and a bare span is INLINE — the margin utilities do
            nothing and the lines pile on top of each other. The anchor cannot
            hold block elements, so the layout has to come from the container.
          */}
          <span className="relative flex flex-col gap-2 p-5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-pill bg-danger text-2xs px-2.5 py-1 font-bold text-white">
                {badge(lead)}
              </span>
              {/* Named by what it is — the offer that runs out first — rather
                  than by a superlative the data cannot support. */}
              <span className="rounded-pill bg-white/90 text-2xs px-2.5 py-1 font-semibold text-neutral-900">
                {tOffers('endingSoonest')}
              </span>
            </span>

            {/* `dir="auto"`: an offer's name is the shopkeeper's own text. */}
            <span dir="auto" className="clamp-2 block text-xl leading-tight font-bold text-white">
              {pickLocale(lead.name, locale)}
            </span>

            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-white/85">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <Store className="h-4 w-4 shrink-0" aria-hidden />
                {pickLocale(lead.shopName, locale)}
              </span>
              {productCount(lead) && (
                <span className="text-sm tabular-nums">{productCount(lead)}</span>
              )}
              <OfferCountdown endsAt={lead.endsAt.toISOString()} className="text-white" />
            </span>
          </span>
        </Link>

        {rest.length > 0 && (
          /*
           * ONE COLUMN, not two.
           *
           * Two columns had two problems and the same cause — a follower row
           * had no width to spare. With four live campaigns the second column
           * left the last row stranded beside an empty cell, and neither cell
           * was wide enough to show anything but text. A single column gives
           * each campaign the full width of the panel, which is what makes room
           * for the goods; the rows are SHORTER than the two-up ones were, so
           * the band ends higher up the page even with the pictures in it.
           */
          <ul className="flex flex-col gap-3">
            {rest.map((offer) => (
              <li key={offer.id}>
                <Link
                  href={`/shops/${offer.shopSlug}`}
                  className="pressable rounded-card border-border bg-card shadow-card hover:border-accent-300 hover:shadow-overlay flex h-full items-center gap-3 overflow-hidden border p-2 transition-[box-shadow,border-color,scale] duration-150 ease-out"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-pill bg-danger-bg text-danger text-2xs px-2 py-0.5 font-bold">
                        {badge(offer)}
                      </span>
                      <OfferCountdown
                        endsAt={offer.endsAt.toISOString()}
                        className="text-muted-foreground"
                      />
                    </span>
                    <span dir="auto" className="clamp-1 block text-sm font-semibold">
                      {pickLocale(offer.name, locale)}
                    </span>
                    <span className="clamp-1 text-muted-foreground block text-xs">
                      {pickLocale(offer.shopName, locale)}
                      {productCount(offer) && (
                        <>
                          <span aria-hidden> · </span>
                          <bdi className="tabular-nums">{productCount(offer)}</bdi>
                        </>
                      )}
                    </span>
                  </span>

                  {/*
                    THE SHOP WINDOW. Up to three of the products this discount
                    actually covers, at the inline end where the eye lands last
                    — the row still reads name-then-goods, and the pictures are
                    the reason to tap rather than the label.

                    `aria-hidden`: the link is already named by its heading and
                    its shop, and three unlabelled thumbnails announced one by
                    one would be three empty stops for a screen reader. Falls
                    back to the shop's representative shot when an offer covers
                    nothing that is currently in stock, so the row is never a
                    picture short of the ones beside it.
                  */}
                  <span className="flex shrink-0 gap-1.5" aria-hidden>
                    {(offer.previewImages?.length
                      ? offer.previewImages
                      : offer.imagePath
                        ? [offer.imagePath]
                        : []
                    ).map((path) => (
                      <span
                        key={path}
                        className="rounded-control relative h-14 w-14 overflow-hidden bg-neutral-100"
                      >
                        <Image src={path} alt="" fill sizes="56px" className="object-cover" />
                      </span>
                    ))}
                    {!offer.previewImages?.length && !offer.imagePath && (
                      <span className="rounded-control bg-accent-100 text-accent-800 flex h-14 w-14 items-center justify-center">
                        <Tag className="h-5 w-5" aria-hidden />
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function OfferShowcaseSkeleton() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Skeleton className="rounded-panel min-h-64" />
        <ul className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <li
              key={index}
              className={cn(
                'rounded-card border-border bg-card flex h-full items-center gap-3 border p-2',
              )}
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="flex shrink-0 gap-1.5">
                {Array.from({ length: 3 }, (_, thumb) => (
                  <Skeleton key={thumb} className="rounded-control h-14 w-14" />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
