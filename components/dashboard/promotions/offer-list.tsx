'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Pencil, Percent, Square, Tag } from 'lucide-react';
import { toast } from 'sonner';

import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { endOffer } from '@/lib/actions/shop-promotions';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { OfferDialog, type OfferDraft, type OfferProduct } from './offer-dialog';

export type OfferRow = {
  id: string;
  name: string;
  nameFa: string;
  nameEn: string;
  type: 'percent' | 'fixed';
  value: number;
  scope: 'shop' | 'products';
  productIds: string[];
  productCount: number | null;
  startsAt: string;
  endsAt: string;
  phase: 'active' | 'scheduled' | 'expired';
};

/**
 * Offers grouped into active / scheduled / expired (PRD §6.4).
 *
 * Three sections rather than one list with status badges, because the question a
 * shopkeeper actually has is "what is running right now" — and that answer should
 * not require reading dates on ten rows.
 */
export function OfferList({
  offers,
  products,
  now,
}: {
  offers: OfferRow[];
  products: OfferProduct[];
  now: string;
}) {
  const t = useTranslations('shopPromotions.offers');

  const sections = [
    { phase: 'active' as const, rows: offers.filter((offer) => offer.phase === 'active') },
    { phase: 'scheduled' as const, rows: offers.filter((offer) => offer.phase === 'scheduled') },
    { phase: 'expired' as const, rows: offers.filter((offer) => offer.phase === 'expired') },
  ];

  return (
    <div className="space-y-5">
      {sections.map((section) =>
        section.rows.length === 0 ? null : (
          <section key={section.phase} className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-bold uppercase">
              {t(`sections.${section.phase}`)}
            </h3>
            <ul className="space-y-2">
              {section.rows.map((offer) => (
                <OfferCard key={offer.id} offer={offer} products={products} now={now} />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function OfferCard({
  offer,
  products,
  now,
}: {
  offer: OfferRow;
  products: OfferProduct[];
  now: string;
}) {
  const t = useTranslations('shopPromotions.offers');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const draft: OfferDraft = {
    id: offer.id,
    nameFa: offer.nameFa,
    nameEn: offer.nameEn,
    type: offer.type,
    value: String(offer.value),
    scope: offer.scope,
    productIds: offer.productIds,
    // The dialog's inputs are datetime-local, which wants local wall-clock time.
    startsAt: offer.startsAt.slice(0, 16),
    endsAt: offer.endsAt.slice(0, 16),
  };

  return (
    <li className="rounded-card border-border bg-card space-y-2 border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="clamp-1 text-sm font-medium">{offer.name}</p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {offer.type === 'percent' ? (
              <Percent className="h-3 w-3" aria-hidden />
            ) : (
              <Tag className="h-3 w-3" aria-hidden />
            )}
            {offer.type === 'percent'
              ? t('percentOff', { value: formatNumber(offer.value, locale) })
              : t('fixedOff', { value: formatCurrency(offer.value, locale) })}
            {' · '}
            {offer.scope === 'shop'
              ? t('wholeShop')
              : t('productScope', { count: formatNumber(offer.productCount ?? 0, locale) })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <OfferDialog
            initial={draft}
            now={now}
            products={products}
            trigger={
              <Button variant="ghost" size="icon" aria-label={t('edit')}>
                <Pencil />
              </Button>
            }
          />
          {offer.phase !== 'expired' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('end')}
              disabled={pending}
              className="hover:text-danger text-neutral-500"
              onClick={() =>
                startTransition(async () => {
                  const result = await endOffer(offer.id);
                  if (!result.ok) toast.error(t(`errors.${result.error}` as never));
                  else {
                    toast.success(t('ended'));
                    router.refresh();
                  }
                })
              }
            >
              <Square />
            </Button>
          )}
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" aria-hidden />
          {formatDate(offer.startsAt, locale)} — {formatDate(offer.endsAt, locale)}
        </span>
        {/* The same countdown the storefront shows, so what the shopkeeper sees
            here is literally what the customer sees. */}
        {offer.phase === 'active' && <OfferCountdown endsAt={offer.endsAt} />}
        {offer.phase === 'scheduled' && <Badge variant="secondary">{t('notStarted')}</Badge>}
      </div>
    </li>
  );
}
