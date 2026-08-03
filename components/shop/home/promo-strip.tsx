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
     * A SCROLLER ON A PHONE, a three-up grid from `sm`.
     *
     * Stacked, these were three 180px blocks of solid colour — over half a
     * screen of promise before the next band of products, on the page where
     * scroll depth is the whole game. Side by side they cost one screen-height
     * and read as a strip, which is what they are. The scroller inherits
     * document direction, so in Dari it starts at the right with no per-locale
     * duplication, and it bleeds to the screen edge exactly like the rails.
     */
    <section className="-mx-4 flex snap-x scrollbar-none gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0">
      {panels.map((panel) => (
        <Link
          key={panel.href}
          href={panel.href}
          className={cn(
            // `scale` is in the list because `transition-*` is a utility and
            // .pressable is not — see components/ui/button.tsx for the same note.
            'pressable rounded-card group flex flex-col gap-3 p-5 transition-[opacity,scale] duration-150 ease-out hover:opacity-95',
            'w-[78%] shrink-0 snap-start sm:w-auto sm:min-h-[180px] sm:p-6',
            panel.surface,
          )}
        >
          <span
            className={cn(
              'rounded-pill flex h-11 w-11 items-center justify-center',
              panel.mark,
            )}
          >
            <panel.icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-xl leading-tight font-extrabold">{panel.title}</span>
          <span className="text-base opacity-80">{panel.body}</span>
          <span
            className={cn('mt-auto flex items-center gap-1 text-sm font-bold', panel.action)}
          >
            {t('promoAction')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </span>
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
          className="rounded-card h-[150px] w-[78%] shrink-0 animate-pulse bg-neutral-100 sm:h-auto sm:min-h-[180px] sm:w-auto"
        />
      ))}
    </section>
  );
}
