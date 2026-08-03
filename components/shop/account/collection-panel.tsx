import { getLocale, getTranslations } from 'next-intl/server';
import { Clock, MapPin, MessageCircle, Phone, QrCode } from 'lucide-react';

import { formatCollectionCode } from '@/lib/collection-code';
import {
  formatDateTime,
  formatNumber,
  formatOpeningHours,
  formatPhone,
  formatUnitNumber,
} from '@/lib/format';
import { cn } from '@/lib/utils';

/** Same treatment the shop hero gives its call / WhatsApp pair. */
const contactAction =
  'rounded-control border-primary-300 bg-card text-primary-800 hover:border-primary hover:bg-primary-100 inline-flex flex-1 items-center justify-center gap-1.5 border px-3 py-2 text-xs font-semibold transition-colors duration-150';

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
  shopPhone,
  floor,
  unitNumber,
  mallHours,
}: {
  code: string;
  expiresAt: Date | null;
  shopName: string;
  /** Nullable in the schema — the panel drops the buttons rather than dialling nothing. */
  shopPhone: string | null;
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

      {/*
        A WAY TO REACH THE SHOP (finding #13).

        This panel's own expiry line warns that the shop may put the goods back
        on the shelf — and offered nothing to do about it. "I am stuck in
        traffic, hold it another hour" is a phone call, and in this mall it is
        the call people actually make; the panel knew the shop's name, the floor
        and the unit and stopped one field short of the number.

        The same pair the shop page already offers, worded the same way: `tel:`
        dials, and wa.me wants the international form because Afghan numbers are
        written locally as 0XXXXXXXXX.
      */}
      {shopPhone && (
        <div className="border-primary-200 flex gap-2 border-t pt-3">
          <a href={`tel:${shopPhone}`} className={cn(contactAction)}>
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="tabular-nums" dir="ltr">
              {formatPhone(shopPhone, locale)}
            </span>
          </a>
          <a
            href={`https://wa.me/93${shopPhone.replace(/^0/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(contactAction)}
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('whatsapp')}
          </a>
        </div>
      )}
    </section>
  );
}
