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
    <section className="grid gap-4 sm:grid-cols-3">
      {panels.map((panel) => (
        <Link
          key={panel.href}
          href={panel.href}
          className={cn(
            // `scale` is in the list because `transition-*` is a utility and
            // .pressable is not — see components/ui/button.tsx for the same note.
            'pressable rounded-card group flex min-h-[180px] flex-col gap-3 p-6 transition-[opacity,scale] duration-150 ease-out hover:opacity-95',
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
    <section className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-card min-h-[180px] animate-pulse bg-neutral-100" />
      ))}
    </section>
  );
}
