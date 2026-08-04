import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Megaphone } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { CampaignList } from '@/components/dashboard/promotions/campaign-list';
import { OfferDialog } from '@/components/dashboard/promotions/offer-dialog';
import { OfferList } from '@/components/dashboard/promotions/offer-list';
import { SlotGrid } from '@/components/dashboard/promotions/slot-booking';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import {
  offerPerformance,
  type OfferPerformance,
  shopCampaignTotals,
  shopCampaigns,
  shopOffers,
  shopPublishedProducts,
  slotInventory,
} from '@/lib/db/queries/shop-promotions';
import { formatCurrency, formatNumber } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

/**
 * Promotions (PRD §6.4).
 *
 * Two tabs because they are two different things (PRD §8): an Offer costs the shop
 * margin and goes live immediately; Featured is inventory bought from Gulbahar and
 * needs approval. Presenting them as one list would blur exactly the distinction
 * the business model rests on.
 */
export default async function ShopPromotionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { tab } = await searchParams;
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopPromotions');

  // Read the clock once, on the server, and pass it down: a client component that
  // called new Date() during render would break React 19's purity rule.
  const now = new Date().toISOString();

  const [offers, slots, campaigns, totals, products] = await Promise.all([
    shopOffers(user.shopId),
    slotInventory(user.shopId),
    shopCampaigns(user.shopId),
    shopCampaignTotals(user.shopId),
    shopPublishedProducts(user.shopId),
  ]);

  // Real order data, per offer — see offerPerformance() for what it does and
  // does not claim. Needs the offers, so it cannot join the batch above.
  const performance = await offerPerformance(user.shopId, offers, new Date(now));
  const tPerf = await getTranslations('shopPromotions.offers.performance');

  const productOptions = products.map((product) => ({
    id: product.id,
    title: pickLocale(product.title, locale),
    price: product.discountPrice ?? product.price,
  }));

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold">{t('title')}</h1>
        {totals.requestedCount > 0 && (
          <Badge variant="warning">
            {t('awaitingApproval', { count: formatNumber(totals.requestedCount, locale) })}
          </Badge>
        )}
      </div>

      {/*
        `dir` IS NOT DECORATION HERE — WITHOUT IT THIS WHOLE PAGE IS LTR.

        Radix's Tabs root writes `dir="ltr"` onto its own element whenever it is
        given neither a `dir` prop nor a DirectionProvider, and that attribute
        beats the `dir="rtl"` on <html>. Everything inside the panels therefore
        inherited a left-to-right base direction while the header, the nav and
        the rest of the console stayed right-to-left: flex rows ran backwards,
        every logical `ms-`/`me-`/`text-start` resolved to the wrong edge, and
        Dari sentences containing numbers resolved against an LTR paragraph and
        shattered — «۲۵٪ تخفیف · ۱ محصول» rendered as «تخفیف ۱ محصول ۲۵٪» with
        the percent sign orphaned onto the next line. That was read as a bidi
        bug in the offer card; it was one attribute, three levels up.
      */}
      <Tabs dir={localeDirection(locale)} defaultValue={tab === 'featured' ? 'featured' : 'offers'}>
        <TabsList>
          <TabsTrigger value="offers">{t('tabs.offers')}</TabsTrigger>
          <TabsTrigger value="featured">{t('tabs.featured')}</TabsTrigger>
        </TabsList>

        <TabsContent value="offers" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-muted-foreground max-w-prose text-xs">{t('offers.intro')}</p>
            <OfferDialog now={now} products={productOptions} />
          </div>

          {offers.length === 0 ? (
            <EmptyState
              illustration={<Megaphone className="h-7 w-7" />}
              title={t('offers.emptyTitle')}
              description={t('offers.emptyBody')}
            />
          ) : (
            <OfferList
              now={now}
              products={productOptions}
              offers={offers.map((offer) => ({
                id: offer.id,
                name: pickLocale(offer.name, locale),
                nameFa: offer.name.fa ?? '',
                nameEn: offer.name.en ?? '',
                type: offer.type,
                value: offer.value,
                scope: offer.scope,
                productIds: offer.productIds ?? [],
                productCount: offer.productCount,
                startsAt: offer.startsAt.toISOString(),
                endsAt: offer.endsAt.toISOString(),
                phase: offer.phase,
                /*
                 * Formatted HERE, on the server. The client half of this panel
                 * never sees a locale or a raw amount, so the money in it is
                 * formatted by the same lib/format call as every other figure
                 * in the dashboard.
                 */
                performance: (() => {
                  const row = performance.get(offer.id);
                  const days = formatNumber(row?.measuredDays ?? 0, locale);
                  return {
                    note: !row
                      ? tPerf('noData')
                      : row.notStarted
                        ? tPerf('notStarted')
                        : row.empty
                          ? tPerf('noData')
                          : null,
                    units: formatNumber(row?.units ?? 0, locale),
                    revenue: formatCurrency(row?.revenue ?? 0, locale),
                    baselineUnits: formatNumber(row?.baselineUnits ?? 0, locale),
                    baselineRevenue: formatCurrency(row?.baselineRevenue ?? 0, locale),
                    windowLabel: tPerf('window', { days, n: row?.measuredDays ?? 0 }),
                    /*
                     * THE PANEL LEADS WITH A SENTENCE (Prompt: four numbers
                     * answer a question nobody asked in that form).
                     *
                     * A shopkeeper reading «۱۲ · ؋۴۸٬۰۰۰ · ۵ · ؋۲۰٬۰۰۰» has to
                     * do the arithmetic themselves to learn the one thing they
                     * came for — did the discount move anything. The four
                     * figures stay underneath, because they are the evidence
                     * for the sentence and a claim with no numbers beside it is
                     * a slogan.
                     *
                     * Still no attribution and still no lift percentage: the
                     * sentence describes what HAPPENED in the window, in the
                     * same careful voice as the caveat below it.
                     */
                    verdict: verdictFor(row, tPerf, locale),
                  };
                })(),
              }))}
            />
          )}
        </TabsContent>

        <TabsContent value="featured" className="space-y-5 pt-4">
          <p className="text-muted-foreground max-w-prose text-xs">{t('featured.intro')}</p>

          {/* What this shop has already bought — the reason to buy more. */}
          <dl className="grid grid-cols-3 gap-3">
            <Stat label={t('featured.spend')} value={formatCurrency(totals.totalSpend, locale)} />
            <Stat
              label={t('featured.impressions')}
              value={formatNumber(totals.impressions, locale)}
            />
            <Stat label={t('featured.clicks')} value={formatNumber(totals.clicks, locale)} />
          </dl>

          <section className="space-y-2">
            <h2 className="text-sm font-bold">{t('featured.slotsHeading')}</h2>
            <SlotGrid
              now={now}
              products={productOptions}
              slots={slots.map((slot) => ({
                id: slot.id,
                key: slot.key,
                name: pickLocale(slot.name, locale),
                capacity: slot.capacity,
                available: slot.available,
                pricePerWeek: slot.pricePerWeek,
                weeklyVisitors: slot.weeklyVisitors,
                acceptsProduct: slot.acceptsProduct,
                needsProduct: slot.needsProduct,
                mine: slot.mine,
              }))}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold">{t('featured.campaignsHeading')}</h2>
            <CampaignList
              campaigns={campaigns.map((campaign) => ({
                id: campaign.id,
                status: campaign.status,
                slotName: pickLocale(campaign.slotName, locale),
                productTitle: campaign.productTitle
                  ? pickLocale(campaign.productTitle, locale)
                  : null,
                startsAt: campaign.startsAt.toISOString(),
                endsAt: campaign.endsAt.toISOString(),
                pricePaid: campaign.pricePaid,
                impressions: campaign.impressions,
                clicks: campaign.clicks,
                daysLeft: campaign.daysLeft,
                rejectionReason: campaign.rejectionReason,
              }))}
            />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border-border bg-card border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold">{value}</dd>
    </div>
  );
}

/**
 * One sentence saying how the offer went — see the note where it is built.
 *
 * The thresholds are deliberately coarse. A 6% difference between two windows
 * of a five-product shop is noise, and a sentence that reports it as movement
 * teaches a shopkeeper to distrust the panel; "about the same" is the honest
 * reading of anything inside a tenth either way. Above DOUBLE the wording drops
 * the ratio and says «چند برابر», for the same reason the dashboard's growth
 * badges do: past a point a multiple stops informing and starts looking broken.
 */
function verdictFor(
  row: OfferPerformance | undefined,
  tPerf: Awaited<ReturnType<typeof getTranslations<'shopPromotions.offers.performance'>>>,
  locale: string,
): string | null {
  if (!row || row.notStarted || row.empty) return null;

  // Sold something out of nothing: a ratio against zero is not a number, and
  // "you had sold none" is the more useful sentence anyway.
  if (row.baselineUnits === 0) {
    return row.units > 0
      ? tPerf('verdictFromNothing', { units: formatNumber(row.units, locale) })
      : null;
  }

  const ratio = row.units / row.baselineUnits;
  if (ratio >= 2) {
    return tPerf('verdictMuchMore', {
      // One decimal would be false precision on counts this small; the whole
      // multiple is what a shopkeeper would say out loud.
      times: formatNumber(Math.round(ratio), locale),
    });
  }
  if (ratio > 1.1) return tPerf('verdictMore');
  if (ratio >= 0.9) return tPerf('verdictSame');
  return tPerf('verdictLess');
}
