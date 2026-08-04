'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';

import { formatPhone } from '@/lib/format';

/**
 * "Ring them once more" — inside the dialog that is about to turn them away
 * (Prompt C6 follow-up).
 *
 * Both the reject dialog and the cancel dialog offer «مشتری در دسترس نبود» as a
 * reason, and both asked the shopkeeper to certify they could not reach someone
 * while offering no way to reach them: the number was on the order screen they
 * had just navigated away from. One more attempt costs a tap; a wrongly
 * rejected order costs a customer.
 *
 * It appears ONLY under that reason code. On «موجود نیست» a call button is
 * noise, and a control that is always there is a control nobody reads.
 *
 * Extracted rather than written twice so the two dialogs cannot drift into
 * offering different help for the same situation — the same argument the reject
 * button itself was extracted on.
 */
export function CallCustomerLink({ phone }: { phone: string }) {
  const t = useTranslations('shopOrders.actions');
  const locale = useLocale();

  return (
    <div className="space-y-1.5">
      {/* A real `tel:` link: on the phone this persona is holding, that IS the
          interaction — no copy, no retyping a number from memory. */}
      <a
        href={`tel:${phone}`}
        className="rounded-control border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100 flex items-center gap-2 border p-3 text-sm font-semibold transition-colors duration-150"
      >
        <Phone className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{t('callCustomer')}</span>
        {/* Persian digits like every other number in the fa UI, and isolated so
            the left-to-right number cannot drag its label across the row. */}
        <bdi className="tabular-nums" dir="ltr">
          {formatPhone(phone, locale)}
        </bdi>
      </a>
      <p className="text-muted-foreground text-xs">{t('callCustomerHint')}</p>
    </div>
  );
}
