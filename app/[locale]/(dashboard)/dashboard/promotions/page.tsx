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
  shopCampaignTotals,
  shopCampaigns,
  shopOffers,
  shopPublishedProducts,
  slotInventory,
} from '@/lib/db/queries/shop-promotions';
import { formatCompact, formatCurrency, formatNumber } from '@/lib/format';

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

      <Tabs defaultValue={tab === 'featured' ? 'featured' : 'offers'}>
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
              value={formatCompact(totals.impressions, locale)}
            />
            <Stat label={t('featured.clicks')} value={formatCompact(totals.clicks, locale)} />
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
