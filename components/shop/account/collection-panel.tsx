import { getLocale, getTranslations } from 'next-intl/server';
import { Clock, MapPin, QrCode } from 'lucide-react';

import { formatCollectionCode } from '@/lib/collection-code';
import { formatDateTime, formatNumber, formatOpeningHours, formatUnitNumber } from '@/lib/format';

/**
 * The collection code, on the customer's own order (Prompt C11).
 *
 * THE BIGGEST THING ON THE SCREEN, because it is the only thing on this page
 * that is used while standing up. Everything else — items, totals, the event
 * chain — is read at home; this is read at a counter in a noisy mall with one
 * hand holding a phone, and it has to survive being glanced at.
 *
 * `dir="ltr"` and `tracking` on the code itself: it is a dictated string, not
 * prose, and in an RTL paragraph an unmarked Latin code renders in the wrong
 * order — the same class of bug as an unmarked phone number (lib/format.ts).
 *
 * The unit and the mall's hours are HERE rather than a link away. "Which floor
 * and are they still open" are the two questions between having a code and
 * having the goods, and a customer already on the stairs should not have to go
 * and find the shop page.
 */
export async function CollectionPanel({
  code,
  expiresAt,
  shopName,
  floor,
  unitNumber,
  mallHours,
}: {
  code: string;
  expiresAt: Date | null;
  shopName: string;
  floor: number | null;
  unitNumber: string | null;
  mallHours: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('orders.collection');

  return (
    <section
      data-collection-panel
      className="rounded-card border-primary-200 bg-primary-50 space-y-3 border p-4"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-control bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center">
          <QrCode className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-primary-900 text-sm font-bold">{t('title')}</h2>
          <p className="text-primary-900/80 text-xs leading-relaxed">
            {t('body', { shop: shopName })}
          </p>
        </div>
      </div>

      <p
        dir="ltr"
        data-collection-code={code}
        className="rounded-card border-primary-300 bg-card text-primary-900 border-2 border-dashed py-3 text-center font-mono text-3xl font-bold tracking-[0.2em]"
      >
        {formatCollectionCode(code)}
      </p>

      <dl className="grid gap-2 sm:grid-cols-2">
        {floor !== null && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="text-primary-700 h-4 w-4 shrink-0" aria-hidden />
            <dt className="sr-only">{t('whereLabel')}</dt>
            <dd className="text-primary-900">
              {t('where', {
                floor: formatNumber(floor, locale),
                unit: formatUnitNumber(unitNumber, locale) || '—',
              })}
            </dd>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Clock className="text-primary-700 h-4 w-4 shrink-0" aria-hidden />
          <dt className="sr-only">{t('hoursLabel')}</dt>
          <dd className="text-primary-900">{formatOpeningHours(mallHours, locale)}</dd>
        </div>
      </dl>

      {expiresAt && (
        <p className="text-primary-900/70 text-xs">
          {t('expires', { when: formatDateTime(expiresAt, locale) })}
        </p>
      )}
    </section>
  );
}
