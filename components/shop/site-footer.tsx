import { getTranslations } from 'next-intl/server';
import { Clock, MapPin, Phone } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';

/**
 * Footer (PRD §5.1): mall address and floor guide.
 *
 * The floor guide is deliberately here rather than as a browsing axis (PRD §4) —
 * it is orientation information for someone collecting an order in person.
 */
export async function SiteFooter() {
  const t = await getTranslations();

  const floors = [
    { floor: t('footer.floor1'), trades: t('footer.floor1Trades') },
    { floor: t('footer.floor2'), trades: t('footer.floor2Trades') },
    { floor: t('footer.floor3'), trades: t('footer.floor3Trades') },
  ];

  return (
    <footer className="border-border mt-12 border-t bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-control bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center text-sm font-bold">
              گ
            </span>
            <span className="text-base font-bold">{t('brand.shortName')}</span>
          </div>
          <p className="text-muted-foreground text-sm">{t('footer.tagline')}</p>
        </div>

        <div className="space-y-2 text-sm">
          <h3 className="text-foreground font-semibold">{t('footer.visitUs')}</h3>
          <p className="text-muted-foreground flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t('brand.tagline')}
          </p>
          <p className="text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {t('footer.hours')}
          </p>
          <p className="text-muted-foreground flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span dir="ltr">{t('footer.phone')}</span>
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <h3 className="text-foreground font-semibold">{t('footer.floorGuide')}</h3>
          <ul className="text-muted-foreground space-y-1">
            {floors.map((entry) => (
              <li key={entry.floor}>
                <span className="text-foreground font-medium">{entry.floor}</span> — {entry.trades}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 text-sm">
          <h3 className="text-foreground font-semibold">{t('footer.explore')}</h3>
          <ul className="space-y-1">
            {[
              { href: '/products', label: t('nav.products') },
              { href: '/shops', label: t('nav.shops') },
              { href: '/offers', label: t('nav.offers') },
              { href: '/account/orders', label: t('nav.orders') },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-muted-foreground hover:text-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-border text-muted-foreground border-t px-4 py-4 text-center text-xs">
        {t('footer.copyright')}
      </div>
    </footer>
  );
}
