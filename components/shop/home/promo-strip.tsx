import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Store, Tag, Truck } from 'lucide-react';

import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/offers';
import { cn } from '@/lib/utils';

/**
 * The mid-page banner strip (PRD §5.1).
 *
 * The mockup fills this band with three tenant advertisements. Selling three
 * more placements is not in the promotion inventory (PRD §8.2 lists six slots
 * and this is none of them), so the band carries the mall's OWN three promises
 * instead — the two fulfilment options and the live offers page. Same rhythm,
 * nothing invented, and the delivery figures come from lib/offers so they cannot
 * contradict checkout.
 *
 * The three surfaces cycle brand green, cool grey-blue and warm cream exactly as
 * the mockup does, so no two adjacent panels share a background.
 */
export async function PromoStrip() {
  const t = await getTranslations('home');
  const locale = await getLocale();

  const panels = [
    {
      href: '/products',
      icon: Truck,
      title: t('promoFreeDeliveryTitle'),
      body: t('promoFreeDeliveryBody', {
        threshold: formatNumber(FREE_DELIVERY_THRESHOLD, locale),
      }),
      surface: 'bg-primary-700 text-primary-foreground',
      mark: 'bg-primary-foreground/15 text-primary-foreground',
      action: 'text-accent-300',
    },
    {
      href: '/shops',
      icon: Store,
      title: t('promoPickupTitle'),
      body: t('promoPickupBody'),
      surface: 'bg-tint-cool text-foreground',
      mark: 'bg-card text-primary',
      action: 'text-primary',
    },
    {
      href: '/offers',
      icon: Tag,
      title: t('promoOffersTitle'),
      body: t('promoOffersBody'),
      surface: 'bg-tint-warm text-foreground',
      mark: 'bg-card text-accent-600',
      action: 'text-accent-700',
    },
  ];

  return (
    /*
     * ONE COMPACT STRIP, AND IT SITS AT THE END OF THE PAGE — both changes, and
     * they answer two different complaints.
     *
     * PLACEMENT first. These are the mall's promises, not its goods, and mid-
     * feed they cost a full screen of not-shopping between two product rails on
     * a 390px phone. A promise is read at the moment of doubt, which is after
     * the browsing rather than in the middle of it, so the strip now sits below
     * the last product band. It could have stayed where it was purely as a
     * shape break — that was its original job — but FeaturedShops and
     * ShopSpotlight are shape breaks too, and neither of them stops the scroll.
     *
     * HEIGHT second, and it is why moving alone was not enough: three 180px
     * blocks of solid colour immediately above the footer is still a screen of
     * colour, just later. Each panel is one row now — mark, title, body, all on
     * the same line — so the whole band is a strip a shopper can take in
     * without stopping. The three surfaces still cycle green, cool grey-blue
     * and warm cream so no two adjacent panels share a background.
     *
     * A SCROLLER ON A PHONE, a three-up grid from `sm`. The scroller inherits
     * document direction, so in Dari it starts at the right with no per-locale
     * duplication, and it bleeds to the screen edge exactly like the rails.
     *
     * `scroll-ps-4` is what keeps the gutter: a snapport is the scrollport less
     * SCROLL-padding, not less padding, so without it the first panel snapped
     * flush to the screen edge. Same fix, same reason, as Rail.
     */
    <section className="-mx-4 flex snap-x scroll-ps-4 scrollbar-none gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:scroll-ps-0">
      {panels.map((panel) => (
        <Link
          key={panel.href}
          href={panel.href}
          className={cn(
            // `scale` is in the list because `transition-*` is a utility and
            // .pressable is not — see components/ui/button.tsx for the same note.
            'pressable rounded-card group flex items-center gap-3 p-4 transition-[opacity,scale] duration-150 ease-out hover:opacity-95',
            'w-[78%] shrink-0 snap-start sm:w-auto',
            panel.surface,
          )}
        >
          <span
            className={cn(
              'rounded-pill flex h-10 w-10 shrink-0 items-center justify-center',
              panel.mark,
            )}
          >
            <panel.icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base leading-tight font-bold">{panel.title}</span>
            <span className="truncate text-sm opacity-80">{panel.body}</span>
          </span>
          {/*
            The label goes, the arrow stays. "خرید کنید" under a panel that IS a
            link said nothing the chevron does not, and at this height it was
            the row that had to be cut for the other two to fit on one line.
          */}
          <ArrowRight
            className={cn('ms-auto h-4 w-4 shrink-0 rtl:rotate-180', panel.action)}
            aria-hidden
          />
        </Link>
      ))}
    </section>
  );
}

export function PromoStripSkeleton() {
  return (
    <section className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="rounded-card h-[72px] w-[78%] shrink-0 animate-pulse bg-neutral-100 sm:w-auto"
        />
      ))}
    </section>
  );
}
