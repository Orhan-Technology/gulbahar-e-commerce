import { getLocale, getTranslations } from 'next-intl/server';

import { ReleaseHoldButton } from '@/components/dashboard/release-hold-button';
import { formatCollectionCode } from '@/lib/collection-code';
import { expiredHolds } from '@/lib/db/queries/shop-orders';
import { formatDateTime, formatNumber, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Reservations nobody came for (Prompt C11).
 *
 * SURFACED IN THE QUEUE, NOT EXPIRED BY A TIMER, and that is a product decision
 * rather than a missing feature. This build has no scheduler — but even with
 * one, a hold that released itself would put the goods back on the shelf while
 * the customer was climbing the stairs. The shopkeeper is standing next to the
 * parcel and is the only one who can see whether it is still worth waiting.
 *
 * The CUSTOMER'S PHONE is on the row. The action offered here is destructive to
 * somebody's shopping, and the cheapest alternative — ring them first — should
 * be the easiest thing on the card, not a lookup in another screen.
 *
 * Renders nothing when there are none. An empty "expired reservations" panel on
 * a queue whose job is to be short would be a permanent piece of furniture
 * announcing that nothing is wrong.
 */
export async function ExpiredHolds({ shopId, now }: { shopId: string; now: Date }) {
  const locale = await getLocale();
  const t = await getTranslations('shopOrders.holds');

  const holds = await expiredHolds(shopId, now);
  if (holds.length === 0) return null;

  return (
    <section
      data-expired-holds={holds.length}
      className="rounded-card border-accent-warm/40 bg-accent-warm/10 space-y-3 border p-4"
    >
      <div>
        <h2 className="text-sm font-bold">
          {t('title', { count: formatNumber(holds.length, locale) })}
        </h2>
        <p className="text-muted-foreground text-xs leading-relaxed">{t('body')}</p>
      </div>

      <ul className="space-y-2">
        {holds.map((hold) => (
          <li
            key={hold.id}
            className="rounded-control border-border bg-card flex flex-wrap items-center gap-3 border p-3"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/dashboard/orders/${hold.id}`}
                className="hover:text-primary font-mono text-sm font-bold tabular-nums"
              >
                {hold.reference}
              </Link>
              <p className="text-muted-foreground text-xs">
                <bdi>{hold.customerName}</bdi>
                {' · '}
                <span dir="ltr">{formatPhone(hold.customerPhone, locale)}</span>
              </p>
              <p className="text-muted-foreground text-2xs">
                {t('expired', { when: formatDateTime(hold.holdExpiresAt!, locale) })}
                {hold.collectionCode && (
                  <>
                    {' · '}
                    <span dir="ltr" className="font-mono">
                      {formatCollectionCode(hold.collectionCode)}
                    </span>
                  </>
                )}
              </p>
            </div>

            <span className="text-muted-foreground shrink-0 text-xs">
              {t('units', { count: formatNumber(hold.units, locale) })}
            </span>

            <ReleaseHoldButton orderId={hold.id} reference={hold.reference} />
          </li>
        ))}
      </ul>
    </section>
  );
}
