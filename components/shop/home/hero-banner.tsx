import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Tag } from 'lucide-react';

import { HeroCarousel, type HeroSlide } from '@/components/shop/home/hero-carousel';
import { OfferCountdown } from '@/components/shop/home/offer-countdown';
import { pickLocale } from '@/lib/db/localized';
import { activeOffers, homeHeroCampaign } from '@/lib/db/queries/home';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Home hero (PRD §5.1) — the first thing the client sees, and the mall's most
 * expensive placement (PRD §8.2).
 *
 * Split two-up: a rotating hero at 2.1fr beside a promo card at 1fr. The narrow
 * card carries the best live OFFER rather than a second paid slot — offers are
 * shop-funded discounts, so it gets no Sponsored badge (PRD §8.1 vs §8.2) and
 * the mall is not credited with inventory it never sold.
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
  const [campaign, offers] = await Promise.all([homeHeroCampaign(), activeOffers(4)]);
  const offer = offers[0] ?? null;

  const slides: HeroSlide[] = [];

  if (campaign) {
    // Fire-and-forget; a failed counter must never break the page (PRD §15).
    void recordImpressions([campaign.campaignId]);
    const isProduct = Boolean(campaign.productId);
    slides.push({
      key: `campaign-${campaign.campaignId}`,
      href: isProduct ? `/products/${campaign.productSlug}` : `/shops/${campaign.shopSlug}`,
      eyebrow: pickLocale(campaign.shopName, locale),
      sponsored: true,
      title: isProduct
        ? pickLocale(campaign.productTitle, locale)
        : pickLocale(campaign.shopName, locale),
      body:
        !isProduct && campaign.shopDescription
          ? pickLocale(campaign.shopDescription, locale)
          : undefined,
      imagePath: isProduct ? campaign.productImagePath : campaign.shopBannerPath,
      ctaLabel: isProduct ? t('heroViewProduct') : t('heroVisitShop'),
    });
  }

  /*
   * The offer occupying the side card is skipped here: showing the same
   * discount twice, side by side, is what an empty catalogue looks like.
   */
  for (const item of offers.slice(1, 4)) {
    slides.push({
      key: `offer-${item.id}`,
      href: `/shops/${item.shopSlug}`,
      eyebrow: pickLocale(item.shopName, locale),
      title:
        item.type === 'percent'
          ? t('offerUpTo', { percent: formatPercent(item.value / 100, locale) })
          : pickLocale(item.name, locale),
      body: pickLocale(item.name, locale),
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

  return (
    <section className="grid gap-4 lg:grid-cols-[2.1fr_1fr]">
      <HeroCarousel slides={slides} />

      {offer && (
        <Link
          href={`/shops/${offer.shopSlug}`}
          className="pressable rounded-card group flex min-h-[220px] flex-col overflow-hidden bg-neutral-100 transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-200 lg:min-h-[380px]"
        >
          <span className="flex items-start justify-between gap-3 p-6 pb-4">
            <span className="flex min-w-0 flex-col">
              <span className="text-foreground text-2xl leading-tight font-extrabold">
                {offer.type === 'percent'
                  ? t('offerUpTo', { percent: formatPercent(offer.value / 100, locale) })
                  : pickLocale(offer.name, locale)}
              </span>
              <span className="text-primary mt-2 text-base font-bold">
                {pickLocale(offer.shopName, locale)}
              </span>
              <OfferCountdown
                endsAt={offer.endsAt.toISOString()}
                className="mt-3 text-neutral-600"
              />
            </span>
            <span className="rounded-pill bg-card text-accent flex h-10 w-10 shrink-0 items-center justify-center">
              <Tag className="h-4 w-4" aria-hidden />
            </span>
          </span>

          {offer.imagePath && (
            <span className="rounded-media relative mx-4 mb-4 block flex-1 overflow-hidden">
              <Image
                src={offer.imagePath}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 380px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </span>
          )}
        </Link>
      )}
    </section>
  );
}

export function HeroBannerSkeleton() {
  return (
    <section className="grid gap-4 lg:grid-cols-[2.1fr_1fr]">
      <div className="flex flex-col gap-3">
        <div className="rounded-card min-h-[320px] flex-1 animate-pulse bg-neutral-200 lg:min-h-[380px]" />
        {/* The dot row is part of the layout, so it is part of the skeleton. */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} className="rounded-pill h-2 w-2 bg-neutral-200" />
          ))}
        </div>
      </div>
      <div className="rounded-card min-h-[220px] animate-pulse bg-neutral-100 lg:min-h-[380px]" />
    </section>
  );
}
