import { getLocale, getTranslations } from 'next-intl/server';
import { CreditCard, Store, Truck } from 'lucide-react';

import { formatNumber, formatUnitNumber } from '@/lib/format';
import { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from '@/lib/offers';

/**
 * How this product reaches the buyer (PRD §5.2, §5.3).
 *
 * Every figure here is read from lib/offers or from the shop's own row, so the
 * panel cannot promise something checkout will not honour. The mockup's "arrives
 * tomorrow" is deliberately not reproduced: there is no courier integration and
 * no per-shop SLA behind it, and a delivery date a demo cannot keep is the one
 * promise a client will remember. "1–2 working days" is what the mall actually
 * tells customers.
 */
export async function FulfilmentPanel({
  floor,
  unitNumber,
}: {
  floor: number | null;
  unitNumber: string | null;
}) {
  const t = await getTranslations('product');
  const common = await getTranslations('common');
  const brand = await getTranslations('brand');
  const locale = await getLocale();

  const pickupWhere = [
    brand('mallShort'),
    floor !== null ? common('floorName', { floor }) : null,
    formatUnitNumber(unitNumber, locale) || null,
  ]
    .filter(Boolean)
    .join(' · ');

  /*
   * PICKUP LEADS.
   *
   * Delivery was first because that is the order every marketplace built for
   * somewhere else puts them in — but those marketplaces do not own the
   * building. Collecting from the counter is free, it is available today rather
   * than in one to two working days, and the shop is a named unit on a named
   * floor of a mall this reader can probably see from where they are standing.
   * It is the strongest thing on this panel and it was second, under a paid
   * option, which is the ordering of a courier business rather than a mall.
   *
   * The order of the other two is unchanged: delivery for whoever does not want
   * the walk, then how they pay for either.
   */
  const rows = [
    {
      icon: Store,
      title: t('pickupTitle'),
      body: pickupWhere,
      note: t('pickupFree'),
      extra: null,
    },
    {
      icon: Truck,
      title: t('deliveryTitle'),
      body: t('deliveryBody'),
      note: t('deliveryFee', { fee: formatNumber(DELIVERY_FEE, locale) }),
      extra: t('deliveryFree', { threshold: formatNumber(FREE_DELIVERY_THRESHOLD, locale) }),
    },
    {
      icon: CreditCard,
      title: t('paymentTitle'),
      body: t('paymentBody'),
      note: null,
      extra: null,
    },
  ];

  return (
    <section className="rounded-card border-border divide-border divide-y border">
      {rows.map((row) => (
        <div key={row.title} className="flex items-start gap-3 p-4">
          <span className="rounded-pill bg-primary-50 text-primary flex h-9 w-9 shrink-0 items-center justify-center">
            <row.icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-foreground text-sm font-bold">{row.title}</span>
              {row.note && <span className="text-sm font-semibold text-neutral-600">{row.note}</span>}
            </span>
            <span className="mt-1 block text-xs text-neutral-500">{row.body}</span>
            {row.extra && <span className="text-primary mt-1 block text-xs">{row.extra}</span>}
          </span>
        </div>
      ))}
    </section>
  );
}
