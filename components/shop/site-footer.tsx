import { getLocale, getTranslations } from 'next-intl/server';
import {
  Clock,
  CreditCard,
  Headphones,
  type LucideIcon,
  MapPin,
  Phone,
  Store,
  Truck,
} from 'lucide-react';

import { pickLocale } from '@/lib/db/localized';
import { siteSettings } from '@/lib/db/queries/settings';
import { categoryTree } from '@/lib/db/queries/shops';
import { formatNumber, formatOpeningHours, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Footer (PRD §5.1): the four promises, then link columns, then the mall's own
 * details and the floor guide.
 *
 * The floor guide is deliberately here rather than as a browsing axis (PRD §4) —
 * it is orientation information for someone collecting an order in person.
 *
 * Every link points at a route that exists. The mockup's footer carries about
 * twenty entries — careers, news, gift cards, returns policy, app-store badges,
 * social accounts — and this build has none of those pages, no app and no
 * accounts. Rendering them would be twenty dead ends in the most-scrutinised
 * part of a demo, so the columns are the mockup's shape filled with what is
 * genuinely there.
 *
 * Every mall fact here — address, hours, support number, delivery fee and
 * threshold, currency label — is read from `platform_settings`, which the admin
 * edits (A4). The delivery promise in particular cannot drift from what
 * checkout charges, because both read the same row.
 */
export async function SiteFooter() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [tree, settings] = await Promise.all([categoryTree(locale), siteSettings()]);

  const promises: Array<{ icon: LucideIcon; title: string; body: string }> = [
    {
      icon: Store,
      title: t('footer.trustPickupTitle'),
      body: t('footer.trustPickupBody'),
    },
    {
      icon: Truck,
      title: t('footer.trustDeliveryTitle'),
      body: t('footer.trustDeliveryBody', {
        fee: formatNumber(settings.deliveryFee, locale),
        threshold: formatNumber(settings.freeDeliveryThreshold, locale),
      }),
    },
    {
      icon: CreditCard,
      title: t('footer.trustPaymentTitle'),
      body: t('footer.trustPaymentBody'),
    },
    {
      icon: Headphones,
      title: t('footer.trustSupportTitle'),
      body: t('footer.trustSupportBody'),
    },
  ];

  const floors = [
    { floor: t('footer.floor1'), trades: t('footer.floor1Trades') },
    { floor: t('footer.floor2'), trades: t('footer.floor2Trades') },
    { floor: t('footer.floor3'), trades: t('footer.floor3Trades') },
  ];

  return (
    <footer className="border-border mt-12 border-t bg-neutral-50">
      {/* ---------------------------------------------------------------- */}
      {/* The four promises                                                */}
      <div className="max-w-page mx-auto grid gap-4 px-4 pt-8 sm:grid-cols-2 sm:px-7 lg:grid-cols-4">
        {promises.map((promise) => (
          <div
            key={promise.title}
            className="rounded-media bg-card flex items-center gap-4 p-5"
          >
            <span className="rounded-pill bg-primary-50 text-primary flex h-11 w-11 shrink-0 items-center justify-center">
              <promise.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="text-foreground block text-base font-bold">{promise.title}</span>
              <span className="mt-1 block text-xs text-neutral-500">{promise.body}</span>
            </span>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Link columns                                                     */}
      <div className="max-w-page mx-auto grid gap-8 px-4 pt-11 sm:grid-cols-2 sm:px-7 lg:grid-cols-4">
        <FooterColumn title={t('footer.aboutHeading')}>
          <p className="text-sm leading-relaxed text-neutral-600">{t('footer.tagline')}</p>
          <p className="flex items-start gap-2 text-sm text-neutral-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {pickLocale(settings.address, locale)}
          </p>
          <p className="flex items-center gap-2 text-sm text-neutral-600">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {formatOpeningHours(settings.hours, locale)}
          </p>
          <p className="flex items-center gap-2 text-sm text-neutral-600">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span dir="ltr">{formatPhone(settings.supportPhone, locale)}</span>
          </p>
        </FooterColumn>

        <FooterColumn title={t('footer.shoppingHeading')}>
          <FooterLink href="/products">{t('nav.products')}</FooterLink>
          <FooterLink href="/offers">{t('nav.bestDeals')}</FooterLink>
          <FooterLink href="/account/orders">{t('footer.trackOrder')}</FooterLink>
          <FooterLink href="/account/wishlist">{t('nav.wishlist')}</FooterLink>
          <FooterLink href="/cart">{t('nav.cart')}</FooterLink>
        </FooterColumn>

        <FooterColumn title={t('footer.categoriesHeading')}>
          {tree.slice(0, 6).map((category) => (
            <FooterLink key={category.slug} href={`/categories/${category.slug}`}>
              {pickLocale(category.name, locale)}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title={t('footer.shopsHeading')}>
          <FooterLink href="/shops">{t('nav.shops')}</FooterLink>
          <FooterLink href="/dashboard">{t('nav.registerShop')}</FooterLink>
          <div className="pt-2">
            <span className="text-foreground block text-sm font-semibold">
              {t('footer.floorGuide')}
            </span>
            <ul className="mt-1 space-y-1">
              {floors.map((entry) => (
                <li key={entry.floor} className="text-xs leading-relaxed text-neutral-600">
                  <span className="text-foreground font-medium">{entry.floor}</span> — {entry.trades}
                </li>
              ))}
            </ul>
          </div>
        </FooterColumn>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Bottom bar — copyright and the two payment methods that exist    */}
      <div className="border-border mx-auto mt-10 flex max-w-page flex-wrap items-center justify-between gap-3 border-t px-4 py-5 sm:px-7">
        <span className="text-xs text-neutral-500">
          {t('footer.copyright', { name: pickLocale(settings.mallName, locale) })}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-2xs text-neutral-500">
            {t('footer.pricesIn', { currency: pickLocale(settings.currencyLabel, locale) })}
          </span>
          <span className="text-2xs text-neutral-500">{t('footer.paymentMethods')}</span>
          <span className="rounded-control bg-card text-2xs border-border border px-2.5 py-1 font-semibold text-neutral-700">
            {t('checkout.hesabpay')}
          </span>
          <span className="rounded-control bg-card text-2xs border-border border px-2.5 py-1 font-semibold text-neutral-700">
            {t('footer.cashOnDelivery')}
          </span>
        </span>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-foreground pb-1 text-base font-bold">{title}</h3>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="hover:text-primary block text-sm text-neutral-600 transition-colors duration-150"
    >
      {children}
    </Link>
  );
}
