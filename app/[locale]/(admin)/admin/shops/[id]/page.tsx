import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  ChevronRight,
  Clock,
  ExternalLink,
  ImageOff,
  MapPin,
  Phone,
  Store,
  User,
} from 'lucide-react';

import { ShopActions } from '@/components/admin/shop-actions';
import { PriceDisplay } from '@/components/custom/price-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminShopReview } from '@/lib/db/queries/admin';
import { formatDate, formatNumber, formatOpeningHours, formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

const STATUS_BADGE = {
  approved: 'success',
  pending: 'warning',
  suspended: 'secondary',
  closed: 'destructive',
} as const;

/**
 * Shop review screen (PRD §7.1) — the live approval moment in the walkthrough.
 *
 * Shows EVERYTHING the shop built, drafts included, so approval is a real decision
 * rather than a rubber stamp: profile, contact, location, and the whole catalogue
 * with images. There is no edit affordance anywhere on this page (PRD §3.1) —
 * admin's only levers are the status buttons.
 */
export default async function AdminShopReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminShops');

  const shop = await adminShopReview(id);
  if (!shop) notFound();

  const published = shop.catalogue.filter((item) => item.status === 'published').length;
  const withoutImages = shop.catalogue.filter((item) => item.imageCount === 0).length;

  return (
    <div className="space-y-5 p-6">
      <nav className="text-muted-foreground flex items-center gap-1 text-xs">
        <Link href="/admin/shops" className="hover:text-primary">
          {t('title')}
        </Link>
        <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
        <span className="text-foreground">{pickLocale(shop.name, locale)}</span>
      </nav>

      {/* Banner + identity */}
      <section className="rounded-card border-border bg-card overflow-hidden border">
        <div className="relative h-32 bg-neutral-100 sm:h-40">
          {shop.bannerPath ? (
            <Image src={shop.bannerPath} alt="" fill sizes="100vw" className="object-cover" />
          ) : (
            <span className="text-muted-foreground flex h-full w-full items-center justify-center text-xs">
              {t('noBanner')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-4 p-4">
          <span className="border-background relative -mt-10 h-16 w-16 shrink-0 overflow-hidden rounded-full border-4 bg-neutral-100">
            {shop.logoPath ? (
              <Image src={shop.logoPath} alt="" fill sizes="64px" className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-neutral-400">
                <Store className="h-6 w-6" aria-hidden />
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold">{pickLocale(shop.name, locale)}</h1>
              <Badge variant={STATUS_BADGE[shop.status]}>{t(`filters.${shop.status}`)}</Badge>
              {shop.categoryName && (
                <Badge variant="outline">{pickLocale(shop.categoryName, locale)}</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('registeredOn', { date: formatDate(shop.createdAt, locale) })}
            </p>
            {/* Missing English is worth flagging at review time, not blocking on. */}
            {!shop.name.en && <Badge variant="outline">{t('noEnglishName')}</Badge>}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <ShopActions shopId={shop.id} status={shop.status} />
            {shop.status === 'approved' && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/shops/${shop.slug}`} target="_blank">
                  <ExternalLink />
                  {t('viewPublic')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* An outstanding rejection reason stays visible until resubmission. */}
      {shop.rejectionReason && (
        <section className="rounded-card border-danger-border bg-danger-bg space-y-1 border p-4">
          <p className="text-danger text-sm font-bold">{t('lastRejection')}</p>
          <p className="text-danger/90 text-sm">{shop.rejectionReason}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Profile */}
        <section className="rounded-card border-border bg-card space-y-3 border p-4 lg:col-span-2">
          <h2 className="text-sm font-bold">{t('aboutHeading')}</h2>
          {shop.description ? (
            <p className="text-sm leading-relaxed">{pickLocale(shop.description, locale)}</p>
          ) : (
            <p className="text-muted-foreground text-sm">{t('noDescription')}</p>
          )}
        </section>

        {/* Contact and location */}
        <section className="rounded-card border-border bg-card space-y-2 border p-4">
          <h2 className="text-sm font-bold">{t('contactHeading')}</h2>

          <p className="flex items-center gap-2 text-sm">
            <User className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
            {shop.ownerName ?? t('noOwner')}
          </p>
          {shop.ownerPhone && (
            <p className="flex items-center gap-2 text-sm" dir="ltr">
              <Phone className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
              {shop.ownerPhone}
            </p>
          )}
          {shop.phone && shop.phone !== shop.ownerPhone && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm" dir="ltr">
              <Phone className="h-4 w-4 shrink-0" aria-hidden />
              {shop.phone}
            </p>
          )}
          {shop.floor !== null && (
            <p className="flex items-center gap-2 text-sm">
              <MapPin className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
              {t('floorUnit', {
                floor: formatNumber(shop.floor, locale),
                unit: formatUnitNumber(shop.unitNumber, locale) || '—',
              })}
            </p>
          )}
          {shop.hours && (
            <p className="flex items-center gap-2 text-sm">
              <Clock className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
              {formatOpeningHours(shop.hours, locale)}
            </p>
          )}
        </section>
      </div>

      {/* The catalogue — drafts included, which is the whole point */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">{t('catalogueHeading')}</h2>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              {t('catalogueCount', {
                total: formatNumber(shop.catalogue.length, locale),
                published: formatNumber(published, locale),
              })}
            </Badge>
            {withoutImages > 0 && (
              <Badge variant="warning">
                {t('withoutImages', { count: formatNumber(withoutImages, locale) })}
              </Badge>
            )}
          </div>
        </div>

        {shop.catalogue.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('noProducts')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shop.catalogue.map((item) => (
              <li key={item.id} className="rounded-control border-border flex gap-3 border p-3">
                <span className="rounded-control relative h-16 w-16 shrink-0 overflow-hidden bg-neutral-100">
                  {item.imagePath ? (
                    <Image src={item.imagePath} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-neutral-400">
                      <ImageOff className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="clamp-2 text-xs font-medium">{pickLocale(item.title, locale)}</p>
                  <PriceDisplay price={item.price} discountPrice={item.discountPrice} size="sm" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={item.status === 'published' ? 'success' : 'secondary'}>
                      {t(`productStatus.${item.status}`)}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {t('imageCount', { count: formatNumber(item.imageCount, locale) })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
