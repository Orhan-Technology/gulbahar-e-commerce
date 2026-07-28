import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Store, Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PriceDisplay } from '@/components/custom/price-display';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
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
 * Split two-up as the mockup draws it: the paid hero at 2.1fr beside a promo
 * card at 1fr. The narrow card carries the best live OFFER rather than a second
 * paid slot — offers are shop-funded discounts, so it gets no Sponsored badge
 * (PRD §8.1 vs §8.2) and the mall is not credited with inventory it never sold.
 *
 * When the hero slot is unsold this renders a branded default rather than
 * collapsing: a hole at the top of the highest-polish screen is the worst thing
 * the client could see.
 */
export async function HeroBanner() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const [campaign, offers] = await Promise.all([homeHeroCampaign(), activeOffers(1)]);
  const offer = offers[0] ?? null;

  return (
    <section className="grid gap-4 lg:grid-cols-[2.1fr_1fr]">
      {campaign ? <PaidHero campaign={campaign} locale={locale} /> : <DefaultHero />}
      {offer && (
        <Link
          href={`/shops/${offer.shopSlug}`}
          className="rounded-card group flex min-h-[220px] flex-col overflow-hidden bg-neutral-100 transition-colors duration-150 hover:bg-neutral-200 lg:min-h-[380px]"
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
            <span className="rounded-pill bg-card text-accent-600 flex h-10 w-10 shrink-0 items-center justify-center">
              <Tag className="h-4 w-4" aria-hidden />
            </span>
          </span>

          {/* The shop's own product photo fills the lower panel. Copy on top and
              image beneath, as the mockup composes this card — the headline over
              an empty panel was the emptiest thing on the page. */}
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

async function PaidHero({
  campaign,
  locale,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof homeHeroCampaign>>>;
  locale: string;
}) {
  const t = await getTranslations('home');

  // Fire-and-forget; a failed counter must never break the page (PRD §15).
  void recordImpressions([campaign.campaignId]);

  const isProduct = Boolean(campaign.productId);
  const href = isProduct ? `/products/${campaign.productSlug}` : `/shops/${campaign.shopSlug}`;
  const title = isProduct
    ? pickLocale(campaign.productTitle, locale)
    : pickLocale(campaign.shopName, locale);
  const image = isProduct ? campaign.productImagePath : campaign.shopBannerPath;

  return (
    <div className="rounded-card from-primary-800 via-primary-700 to-primary-500 text-primary-foreground relative grid min-h-[320px] overflow-hidden ltr:bg-linear-to-br rtl:bg-linear-to-bl lg:min-h-[380px] lg:grid-cols-[1fr_42%]">
      {/*
       * Copy first in the DOM and the photo second, each in its own grid cell
       * rather than the photo being a full-bleed background. The mockup composes
       * the hero as text beside product, and a `fill` image behind the copy meant
       * the gradient had to be dark enough to bury the photograph to keep the
       * text readable — which is what made the seeded banners look like flat
       * green panels.
       */}
      <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10">
        <span className="flex items-center gap-2">
          <SponsoredBadge tone="dark" />
          <span className="text-accent-300 text-xs font-semibold">
            {pickLocale(campaign.shopName, locale)}
          </span>
        </span>

        <h1 className="max-w-xl text-2xl leading-tight font-extrabold sm:text-3xl">{title}</h1>

        {!isProduct && campaign.shopDescription && (
          <p className="text-primary-200 clamp-2 max-w-lg text-base">
            {pickLocale(campaign.shopDescription, locale)}
          </p>
        )}

        {isProduct && campaign.productPrice !== null && (
          <div className="[&_*]:text-primary-foreground">
            <PriceDisplay
              price={campaign.productPrice}
              discountPrice={campaign.productDiscountPrice}
              size="lg"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-3">
          <Button asChild size="lg" variant="secondary">
            <Link href={href}>
              {isProduct ? t('heroViewProduct') : t('heroVisitShop')}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent"
          >
            <Link href="/products">{t('heroBrowseAll')}</Link>
          </Button>
        </div>
      </div>

      {image && (
        <div className="relative min-h-[180px] lg:min-h-0">
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 590px"
            priority
            className="object-cover"
          />
          {/* Feathers the photo into the gradient instead of ending on a hard
              seam. Physical direction: the photo is always on the far side. */}
          <div className="from-primary-700 absolute inset-0 to-transparent ltr:bg-linear-to-r rtl:bg-linear-to-l" />
        </div>
      )}
    </div>
  );
}

async function DefaultHero() {
  const t = await getTranslations('home');

  return (
    <div className="rounded-card from-primary-800 to-primary-600 text-primary-foreground relative overflow-hidden ltr:bg-linear-to-br rtl:bg-linear-to-bl">
      <div className="relative flex min-h-[320px] flex-col justify-center gap-3 p-6 sm:p-10 lg:min-h-[380px]">
        <span className="rounded-control bg-primary-foreground/15 flex h-11 w-11 items-center justify-center">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="max-w-xl text-2xl leading-tight font-extrabold sm:text-3xl">
          {t('defaultHeroTitle')}
        </h1>
        <p className="text-primary-200 max-w-lg text-base">{t('defaultHeroBody')}</p>
        <div className="pt-3">
          <Button asChild size="lg" variant="secondary">
            <Link href="/products">
              {t('heroBrowseAll')}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function HeroBannerSkeleton() {
  return (
    <section className="grid gap-4 lg:grid-cols-[2.1fr_1fr]">
      <div className="rounded-card min-h-[320px] animate-pulse bg-neutral-200 lg:min-h-[380px]" />
      <div className="rounded-card min-h-[220px] animate-pulse bg-neutral-100 lg:min-h-[380px]" />
    </section>
  );
}
