import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BookingCalendar } from '@/components/admin/booking-calendar';
import { CampaignQueue } from '@/components/admin/campaign-queue';
import { ManualCampaignDialog } from '@/components/admin/manual-campaign-dialog';
import { SlotManager } from '@/components/admin/slot-manager';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { bookingCalendar, campaignLedger, revenueBySlot } from '@/lib/db/queries/admin-revenue';
import { adminProducts, adminShopDirectory } from '@/lib/db/queries/admin';
import { formatNumber } from '@/lib/format';
import { slotAcceptsProduct, slotRequiresProduct } from '@/lib/promotions';
import type { PromotionSlotKey } from '@/lib/db/schema';

/**
 * Promotion inventory, approvals and the booking calendar (PRD §7.3).
 *
 * Requests come first: they are the only thing on this page that somebody is waiting
 * on. Inventory and the calendar follow, because those answer the questions the
 * requests raise — is the slot free, and is it priced right.
 */
export default async function AdminPromotionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminPromotions');

  const [slots, campaigns, calendar, shops, products] = await Promise.all([
    revenueBySlot(),
    campaignLedger(),
    bookingCalendar(8),
    adminShopDirectory({ locale, status: 'approved' }),
    adminProducts({ locale, status: 'published', limit: 500 }),
  ]);

  const requested = campaigns.filter((campaign) => campaign.status === 'requested');

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">{t('title')}</h1>
          <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
        </div>
        <ManualCampaignDialog
          slots={slots.map((slot) => ({
            id: slot.id,
            name: pickLocale(slot.name, locale),
            pricePerWeek: slot.pricePerWeek,
            acceptsProduct: slotAcceptsProduct(slot.key as PromotionSlotKey),
            needsProduct: slotRequiresProduct(slot.key as PromotionSlotKey),
            available: Math.max(slot.capacity - slot.occupied, 0),
          }))}
          shops={shops.map((shop) => ({ id: shop.id, name: pickLocale(shop.name, locale) }))}
          products={products.map((product) => ({
            id: product.id,
            shopId: product.shopId,
            title: pickLocale(product.title, locale),
          }))}
        />
      </div>

      {/* Requests — the only rows needing a decision */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">{t('requestsHeading')}</h2>
          {requested.length > 0 && (
            <Badge variant="warning">{formatNumber(requested.length, locale)}</Badge>
          )}
        </div>
        <CampaignQueue
          campaigns={requested.map((campaign) => ({
            id: campaign.id,
            status: campaign.status,
            shopId: campaign.shopId,
            shopName: pickLocale(campaign.shopName, locale),
            slotName: pickLocale(campaign.slotName, locale),
            productTitle: campaign.productTitle ? pickLocale(campaign.productTitle, locale) : null,
            startsAt: campaign.startsAt.toISOString(),
            endsAt: campaign.endsAt.toISOString(),
            weeks: campaign.weeks,
            pricePaid: campaign.pricePaid,
            impressions: campaign.impressions,
            clicks: campaign.clicks,
            rejectionReason: campaign.rejectionReason,
          }))}
        />
      </section>

      {/* Inventory */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold">{t('slotsHeading')}</h2>
        <SlotManager
          slots={slots.map((slot) => ({
            id: slot.id,
            key: slot.key,
            name: pickLocale(slot.name, locale),
            capacity: slot.capacity,
            pricePerWeek: slot.pricePerWeek,
            occupied: slot.occupied,
            occupancy: slot.occupancy,
          }))}
        />
      </section>

      {/* Who is booked when */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold">{t('calendarHeading')}</h2>
        <BookingCalendar
          slots={calendar.map((slot) => ({
            slotId: slot.slotId,
            slotName: pickLocale(slot.slotName, locale),
            capacity: slot.capacity,
            weeks: slot.weeks,
          }))}
        />
      </section>

      {/* Everything else, read-only with performance */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold">{t('allHeading')}</h2>
        <CampaignQueue
          campaigns={campaigns
            .filter((campaign) => campaign.status !== 'requested')
            .map((campaign) => ({
              id: campaign.id,
              status: campaign.status,
              shopId: campaign.shopId,
              shopName: pickLocale(campaign.shopName, locale),
              slotName: pickLocale(campaign.slotName, locale),
              productTitle: campaign.productTitle
                ? pickLocale(campaign.productTitle, locale)
                : null,
              startsAt: campaign.startsAt.toISOString(),
              endsAt: campaign.endsAt.toISOString(),
              weeks: campaign.weeks,
              pricePaid: campaign.pricePaid,
              impressions: campaign.impressions,
              clicks: campaign.clicks,
              rejectionReason: campaign.rejectionReason,
            }))}
        />
      </section>
    </div>
  );
}
