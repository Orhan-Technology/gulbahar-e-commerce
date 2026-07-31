import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { MapPin, MessageCircle, Phone, Store } from 'lucide-react';

import { RatingStars } from '@/components/custom/rating-stars';
import { FollowButton } from '@/components/shop/follow-button';
import { OpenPill } from '@/components/shop/shop-page/open-pill';
import { VerifiedBadge } from '@/components/shop/verified-badge';
import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { formatNumber, formatPhone, formatUnitNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type ShopHeroShop = {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  categoryName: LocalizedText | null;
  floor: number | null;
  unitNumber: string | null;
  phone: string | null;
  hours: string | null;
  logoPath: string | null;
  bannerPath: string | null;
  verifiedAt: Date | null;
  rating: number;
  reviewCount: number;
  productCount: number;
};

/**
 * The shop hero (Prompt C8).
 *
 * WHAT IT HAS TO ANSWER, in the order someone actually asks: who are you, are
 * you real, are you any good, where are you in the building, are you open right
 * now, and how do I reach you. Everything in here is one of those six; anything
 * that is not belongs in the About tab.
 *
 * The SCRIM is not decoration. Banners are photographs chosen by shopkeepers,
 * so the logo and the name sit on whatever colour that photo happens to be at
 * that corner — a light banner and a white card below it makes an invisible edge. The
 * gradient guarantees the contrast the text needs no matter what is uploaded.
 *
 * CALL is a `tel:` link and WhatsApp is a `wa.me` link — both are just links
 * with no service behind them, which is the only form of "contact the shop"
 * this build is allowed to ship (no SMS gateway, CLAUDE.md). On a phone they
 * open the app that is already installed; on a desktop they degrade to
 * something the browser handles.
 */
export async function ShopHero({
  shop,
  follow,
  mallHours,
  now,
  signedIn,
}: {
  shop: ShopHeroShop;
  follow: { total: number; following: boolean };
  /** The MALL's hours, from admin settings — the building's doors, not the shop's. */
  mallHours: string;
  /** Read once on the server; never called during render (CLAUDE.md). */
  now: Date;
  signedIn: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shop');
  const name = pickLocale(shop.name, locale);

  const contactAction =
    'rounded-control border-border bg-card hover:border-primary hover:text-primary pressable inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition-[color,border-color,scale] duration-150 ease-out';

  return (
    <section className="relative">
      <div className="bg-primary-800 sm:rounded-card relative -mx-4 h-44 overflow-hidden sm:mx-0 sm:mt-4 sm:h-60">
        {shop.bannerPath ? (
          <Image src={shop.bannerPath} alt="" fill sizes="100vw" priority className="object-cover" />
        ) : (
          <div className="from-primary-900 to-primary-700 h-full w-full ltr:bg-linear-to-r rtl:bg-linear-to-l" />
        )}
        {/* The scrim — see the note above. Physical `to-t` is correct here:
            it runs bottom-to-top, an axis with no reading direction. */}
        <div
          className="absolute inset-0 bg-linear-to-t from-black/55 via-black/10 to-transparent"
          aria-hidden
        />

        {/* TOP of the banner, not the bottom: the identity card overlaps the
            lower edge by 40px, and a pill placed there is simply covered. */}
        {shop.hours && (
          <div className="absolute inset-x-0 top-0 flex justify-end p-3 sm:p-4">
            <OpenPill shopHours={shop.hours} mallHours={mallHours} now={now} />
          </div>
        )}
      </div>

      <div className="rounded-card border-border bg-card shadow-card relative -mt-10 flex flex-col gap-4 border p-4 sm:-mt-12 sm:flex-row sm:items-start sm:gap-5">
        <div className="rounded-card border-card bg-primary-100 shadow-card relative h-20 w-20 shrink-0 overflow-hidden border-2">
          {shop.logoPath ? (
            <Image src={shop.logoPath} alt={name} fill sizes="80px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Store className="text-primary-700 h-7 w-7" aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {/* The badge sits WITH the name, not in a row of chips below it: it
              is a fact about who this is, not another attribute (Prompt C7). */}
          <h1 className="flex flex-wrap items-center gap-1.5 text-xl font-bold">
            {name}
            <VerifiedBadge verifiedAt={shop.verifiedAt ? shop.verifiedAt.toISOString() : null} />
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {shop.rating > 0 && (
              <RatingStars value={shop.rating} count={shop.reviewCount} size="sm" />
            )}
            <span className="text-muted-foreground">
              {t('productCount', { count: formatNumber(shop.productCount, locale) })}
            </span>
            {shop.categoryName && (
              <span className="text-muted-foreground">{pickLocale(shop.categoryName, locale)}</span>
            )}
            {shop.floor !== null && (
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('floorUnit', {
                  floor: formatNumber(shop.floor, locale),
                  unit: formatUnitNumber(shop.unitNumber, locale) || '—',
                })}
              </span>
            )}
          </div>

          {shop.description && (
            <p className="text-muted-foreground text-sm">{pickLocale(shop.description, locale)}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <FollowButton
              shopId={shop.id}
              shopSlug={shop.slug}
              initialFollowing={follow.following}
              initialCount={follow.total}
              signedIn={signedIn}
            />

            {shop.phone && (
              <>
                <a href={`tel:${shop.phone}`} className={cn(contactAction)}>
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  <span dir="ltr">{formatPhone(shop.phone, locale)}</span>
                </a>
                <a
                  // Afghan numbers dial as 0XXXXXXXXX locally; wa.me wants the
                  // country code with no leading zero and no punctuation.
                  href={`https://wa.me/93${shop.phone.replace(/^0/, '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(contactAction)}
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  {t('whatsapp')}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
