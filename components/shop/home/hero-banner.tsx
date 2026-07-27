import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PriceDisplay } from '@/components/custom/price-display';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { pickLocale } from '@/lib/db/localized';
import { homeHeroCampaign } from '@/lib/db/queries/home';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { Link } from '@/lib/i18n/navigation';

/**
 * Home hero (PRD §5.1) — the first thing the client sees, and the mall's most
 * expensive placement (PRD §8.2).
 *
 * When the slot is unsold this renders a branded default rather than collapsing:
 * a missing hero would leave a hole at the top of the highest-polish screen.
 */
export async function HeroBanner() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const campaign = await homeHeroCampaign();

  if (!campaign) return <DefaultHero />;

  // Fire-and-forget; a failed counter must never break the page (PRD §15).
  void recordImpressions([campaign.campaignId]);

  const isProduct = Boolean(campaign.productId);
  const href = isProduct ? `/products/${campaign.productSlug}` : `/shops/${campaign.shopSlug}`;
  const title = isProduct
    ? pickLocale(campaign.productTitle, locale)
    : pickLocale(campaign.shopName, locale);
  const image = isProduct ? campaign.productImagePath : campaign.shopBannerPath;

  return (
    <section className="rounded-card bg-primary-800 text-primary-foreground relative overflow-hidden">
      {image && (
        <Image src={image} alt="" fill sizes="100vw" priority className="object-cover opacity-45" />
      )}

      {/*
        Gradient runs from the inline start so the text side is always the darker
        one. Tailwind's gradient directions are physical (to-r / to-l) with no
        logical equivalent, so the direction is selected per writing mode.
      */}
      <div className="from-primary-950/90 via-primary-900/70 to-primary-800/30 absolute inset-0 ltr:bg-linear-to-r rtl:bg-linear-to-l" />

      <div className="relative flex min-h-[280px] flex-col justify-center gap-4 p-6 sm:min-h-[340px] sm:p-10">
        <div className="flex items-center gap-2">
          <SponsoredBadge />
          <span className="text-xs opacity-80">{pickLocale(campaign.shopName, locale)}</span>
        </div>

        <h1 className="max-w-xl text-2xl leading-tight font-bold sm:text-3xl">{title}</h1>

        {!isProduct && campaign.shopDescription && (
          <p className="clamp-2 max-w-lg text-sm opacity-85">
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

        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild variant="accent" size="lg">
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
    </section>
  );
}

async function DefaultHero() {
  const t = await getTranslations('home');

  return (
    <section className="rounded-card from-primary-900 to-primary-700 text-primary-foreground relative overflow-hidden ltr:bg-linear-to-r rtl:bg-linear-to-l">
      <div className="relative flex min-h-[280px] flex-col justify-center gap-4 p-6 sm:min-h-[340px] sm:p-10">
        <span className="rounded-control bg-primary-foreground/15 flex h-11 w-11 items-center justify-center">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="max-w-xl text-2xl leading-tight font-bold sm:text-3xl">
          {t('defaultHeroTitle')}
        </h1>
        <p className="max-w-lg text-sm opacity-85">{t('defaultHeroBody')}</p>
        <div className="pt-2">
          <Button asChild variant="accent" size="lg">
            <Link href="/products">
              {t('heroBrowseAll')}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function HeroBannerSkeleton() {
  return (
    <div className="rounded-card min-h-[280px] animate-pulse bg-neutral-200 sm:min-h-[340px]" />
  );
}
