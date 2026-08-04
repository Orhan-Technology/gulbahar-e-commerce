import { getLocale, getTranslations } from 'next-intl/server';

import { HeroCarousel, type HeroSlide } from '@/components/shop/home/hero-carousel';
import { pickLocale } from '@/lib/db/localized';
import { activeOffers, homeHeroCampaign } from '@/lib/db/queries/home';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { formatNumber, formatPercent } from '@/lib/format';

/**
 * Home hero (PRD §5.1) — the first thing the client sees, and the mall's most
 * expensive placement (PRD §8.2).
 *
 * FULL WIDTH, one rotating banner. It used to be a two-up with a promo card
 * beside it; that card is now the head of the deals band — see below.
 *
 * The carousel's slides are REAL and of two kinds: the paid hero placement
 * first, then the running offers. There is no filler slide — with nothing sold
 * and nothing on offer the carousel is a single branded default, because a hole
 * at the top of the highest-polish screen is the worst thing the client could
 * see, and a rotation between three copies of the same panel is the second
 * worst.
 */
export async function HeroBanner() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const tCommon = await getTranslations('common');
  const [campaign, offers] = await Promise.all([homeHeroCampaign(), activeOffers(4)]);

  /*
   * MONEY IN PROSE TAKES THE WORD, money in a chip takes the symbol — the one
   * rule this surface and /offers now share. «؋۵۶۴» inside a sentence reads as
   * a code; «۵۶۴ افغانی» inside a 6-character badge does not fit.
   */
  const money = (value: number) => `${formatNumber(value, locale)} ${tCommon('currencyWord')}`;

  /*
   * A SUBTITLE THAT REPEATS THE HEADLINE IS NOT A SUBTITLE.
   *
   * A fixed-amount offer has no percentage to lead with, so its headline is the
   * offer's own name — and the body line under it was that same name again,
   * rendering «پیشکش بازگشت به مکتب» twice, once large and once small. Compared
   * after normalising whitespace, because the two strings come from the same
   * column and differ only by the odd trailing space.
   */
  const normalise = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const subtitle = (title: string, body: string | undefined, fallback?: string) => {
    if (body && normalise(body) !== normalise(title)) return body;
    return fallback && normalise(fallback) !== normalise(title) ? fallback : undefined;
  };

  const slides: HeroSlide[] = [];

  if (campaign) {
    // Fire-and-forget; a failed counter must never break the page (PRD §15).
    void recordImpressions([campaign.campaignId]);
    const isProduct = Boolean(campaign.productId);
    const title = isProduct
      ? pickLocale(campaign.productTitle, locale)
      : pickLocale(campaign.shopName, locale);
    slides.push({
      key: `campaign-${campaign.campaignId}`,
      href: isProduct ? `/products/${campaign.productSlug}` : `/shops/${campaign.shopSlug}`,
      eyebrow: pickLocale(campaign.shopName, locale),
      sponsored: true,
      title,
      // A shop slide whose title IS the shop name must not carry the shop name
      // again as its description — which is what happens for a tenant whose
      // description is little more than its own name.
      body: subtitle(
        title,
        campaign.shopDescription ? pickLocale(campaign.shopDescription, locale) : undefined,
      ),
      imagePath: isProduct ? campaign.productImagePath : campaign.shopBannerPath,
      ctaLabel: isProduct ? t('heroViewProduct') : t('heroVisitShop'),
    });
  }

  /*
   * The soonest-ending offer is skipped here: it heads the deals band a screen
   * below, and showing the same discount twice on one scroll is what an empty
   * catalogue looks like.
   */
  for (const item of offers.slice(1, 4)) {
    const title =
      item.type === 'percent'
        ? t('offerUpTo', { percent: formatPercent(item.value / 100, locale) })
        : pickLocale(item.name, locale);

    slides.push({
      key: `offer-${item.id}`,
      href: `/shops/${item.shopSlug}`,
      eyebrow: pickLocale(item.shopName, locale),
      title,
      /*
       * The offer's name, unless the headline already IS the name — in which
       * case the line says what the discount is worth and where, which is the
       * pair of facts the headline could not carry.
       */
      body: subtitle(
        title,
        pickLocale(item.name, locale),
        t('heroOfferSubtitle', {
          discount:
            item.type === 'percent'
              ? formatPercent(item.value / 100, locale)
              : money(item.value),
          shop: pickLocale(item.shopName, locale),
        }),
      ),
      imagePath: item.imagePath,
      ctaLabel: t('heroVisitShop'),
    });
  }

  if (slides.length === 0) {
    slides.push({
      key: 'default',
      href: '/products',
      title: t('defaultHeroTitle'),
      body: t('defaultHeroBody'),
      ctaLabel: t('heroBrowseAll'),
    });
  }

  /*
   * THE SIDE PROMO CARD IS GONE, folded into the deals band (DealsRail).
   *
   * On a 390px screen the two-up collapses to a stack, so the card was not
   * beside the hero at all — it was a second 220px panel between the hero and
   * the first thing anyone can buy, and the first purchasable product sat
   * nearly two screens down. It also duplicated the deals band's subject: both
   * were built from `activeOffers`, both pointed at the same shop, and the
   * band already carries that offer's countdown. One offer, said once, in the
   * section whose whole subject is offers.
   */
  return (
    <section>
      <HeroCarousel slides={slides} />
    </section>
  );
}

export function HeroBannerSkeleton() {
  return (
    <section>
      <div className="flex flex-col gap-3">
        <div className="rounded-card min-h-[320px] flex-1 animate-pulse bg-neutral-200 lg:min-h-[380px]" />
        {/* The dot row is part of the layout, so it is part of the skeleton. */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} className="rounded-pill h-2 w-2 bg-neutral-200" />
          ))}
        </div>
      </div>
    </section>
  );
}
