import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronRight, Tag } from 'lucide-react';

import { SectionHeader, SectionHeaderSkeleton } from '@/components/custom/section-header';
import { pickLocale } from '@/lib/db/localized';
import { formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import {
  ProductGrid,
  ProductGridSkeleton,
  type ProductGridItem,
} from '@/components/shop/product-grid';
import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { activeOffers } from '@/lib/db/queries/home';

/**
 * "Today's best deals" (PRD §5.1) — the mockup's flash band, the one section on
 * the page with a live clock in its heading.
 *
 * The countdown is pinned to the SOONEST-ending live offer, not to an invented
 * midnight deadline: the number has to mean something, and every one of these
 * discounts really does expire when that offer does. With no live offer the
 * heading simply loses its clock and the deals still render, because the
 * discounted prices are on the products themselves.
 */
export async function DealsRail({
  items,
  savedIds,
}: {
  /**
   * Supplied by the page rather than queried here.
   *
   * The home page assembles every product-bearing band in one pass so nothing
   * appears twice down the scroll; a band that fetches for itself cannot know
   * what the band above it already took (lib/db/queries/home.ts).
   */
  items: ProductGridItem[];
  savedIds: Set<string>;
}) {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const offers = await activeOffers(1);

  if (items.length === 0) return null;

  const soonest = offers[0] ?? null;

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('dealsToday')}
        href="/offers"
        adornment={
          soonest ? (
            /*
             * No "ends in" prefix: OfferCountdown already renders "۳ روز باقی
             * مانده" once the deadline is more than a day out, and the two
             * together read "ends in 3 days remaining". Its timer icon carries
             * the meaning at every range.
             */
            <span className="rounded-pill bg-danger-bg flex items-center px-3 py-1.5">
              <OfferCountdown
                endsAt={soonest.endsAt.toISOString()}
                className="text-danger font-semibold"
              />
            </span>
          ) : undefined
        }
      />

      {/*
       * THE HERO'S OLD SIDE CARD, folded in as one row.
       *
       * Same offer, same link, same two facts — the discount and whose shop it
       * is — but a bar rather than a 380px panel. It belongs here because the
       * countdown above it already ticks against this exact offer (both read
       * `activeOffers`, ordered by soonest deadline), so at the top of the page
       * it was a promise with its deadline a screen away, and here it is the
       * sentence the clock beside it is about.
       *
       * The photograph is decorative and only appears from `sm`: on a phone the
       * job of this row is to be short.
       */}
      {soonest && (
        <Link
          href={`/shops/${soonest.shopSlug}`}
          className="pressable rounded-card bg-tint-warm group flex items-center gap-3 overflow-hidden pe-4 ps-4 transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-100 sm:ps-5"
        >
          <span className="rounded-pill bg-card text-accent flex h-10 w-10 shrink-0 items-center justify-center">
            <Tag className="h-4 w-4" aria-hidden />
          </span>

          <span className="flex min-w-0 flex-1 flex-col py-3 sm:flex-row sm:items-baseline sm:gap-2 sm:py-4">
            {/* `dir="auto"` because the offer's name is the shopkeeper's own
                text: a Dari catalogue holds "Black Friday" verbatim, and a
                Latin phrase inheriting RTL puts its punctuation on the wrong
                side. */}
            <span dir="auto" className="text-foreground truncate text-base font-extrabold sm:text-xl">
              {soonest.type === 'percent'
                ? t('offerUpTo', { percent: formatPercent(soonest.value / 100, locale) })
                : pickLocale(soonest.name, locale)}
            </span>
            <span className="text-primary truncate text-sm font-bold">
              {pickLocale(soonest.shopName, locale)}
            </span>
          </span>

          {soonest.imagePath && (
            <span className="relative hidden h-16 w-24 shrink-0 self-stretch sm:block">
              <Image
                src={soonest.imagePath}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            </span>
          )}

          <ChevronRight
            className="text-primary h-5 w-5 shrink-0 rtl:rotate-180"
            aria-hidden
          />
        </Link>
      )}

      <ProductGrid
        items={items}
        savedIds={savedIds}
        layout="row"
        railLabel={t('dealsToday')}
        priority
      />
    </section>
  );
}

export function DealsRailSkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeaderSkeleton />
      <ProductGridSkeleton count={8} layout="row" />
    </section>
  );
}
