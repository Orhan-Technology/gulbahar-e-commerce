import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Building2 } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { FloorMap } from '@/components/shop/floor-map';
import { pressable } from '@/components/motion/pressable';
import { pickLocale } from '@/lib/db/localized';
import { mallMap } from '@/lib/db/queries/mall';
import { siteSettings } from '@/lib/db/queries/settings';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

type Query = { floor?: string; category?: string };

/**
 * The mall floor map (Prompt C11).
 *
 * THE COMPETITIVE ANSWER TO A DELIVERY-ONLY MARKETPLACE. Amazon cannot have
 * this page, because Amazon is not a building. Somebody who is already in
 * Gulbahar Center — or about to drive there — wants to know which floor sells
 * shoes and whether the shop is open, and no amount of search relevance answers
 * that.
 *
 * URL-DRIVEN, like every other filter in this product: `?floor=2&category=shoes`
 * is shareable ("meet me at 214"), survives the back button, and renders on the
 * server so the map is in the HTML rather than assembled after a round trip.
 *
 * The category filter DIMS rather than removes — see FloorMap. A map that
 * changes shape when you filter it stops being a map.
 */
export default async function FloorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('floors');

  const [floors, settings] = await Promise.all([mallMap(), siteSettings()]);
  // Read once, on the server: the open dots and the pill must agree, and a
  // client component may not call `new Date()` during render (CLAUDE.md).
  const now = new Date();

  if (floors.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <EmptyState
          illustration={<Building2 className="h-7 w-7" aria-hidden />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      </div>
    );
  }

  const requested = Number(query.floor);
  const active =
    floors.find((floor) => floor.floor === requested) ?? floors[0];

  const totalShops = floors.reduce(
    (sum, floor) => sum + floor.units.filter((unit) => unit.shop).length,
    0,
  );

  // Only the categories actually present in the building — the same rule the
  // shop page's in-shop chips follow (Prompt C8).
  const categories = new Map<string, string>();
  for (const floor of floors) {
    for (const unit of floor.units) {
      if (unit.shop?.categorySlug && unit.shop.categoryName) {
        categories.set(unit.shop.categorySlug, pickLocale(unit.shop.categoryName, locale));
      }
    }
  }

  const href = (next: { floor?: number; category?: string | null }) => {
    const floor = next.floor ?? active.floor;
    const category = next.category === null ? undefined : (next.category ?? query.category);
    return `/floors?floor=${floor}${category ? `&category=${category}` : ''}`;
  };

  const chip = (isActive: boolean) =>
    cn(
      pressable,
      'rounded-pill shrink-0 border px-3.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out',
      isActive
        ? 'border-primary bg-primary text-primary-foreground font-semibold'
        : 'border-border bg-card hover:border-primary hover:text-primary',
    );

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('subtitle', { shops: formatNumber(totalShops, locale) })}
        </p>
      </header>

      <nav aria-label={t('title')} className="flex flex-wrap gap-2">
        {floors.map((floor) => (
          <Link
            key={floor.floor}
            href={href({ floor: floor.floor })}
            data-floor-tab={floor.floor}
            aria-current={floor.floor === active.floor ? 'page' : undefined}
            className={chip(floor.floor === active.floor)}
          >
            {t('floorTab', { floor: formatNumber(floor.floor, locale) })}
          </Link>
        ))}
      </nav>

      <nav
        aria-label={t('allCategories')}
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0"
      >
        <Link
          href={href({ category: null })}
          aria-current={query.category ? undefined : 'page'}
          className={chip(!query.category)}
        >
          {t('allCategories')}
        </Link>
        {[...categories.entries()].map(([slug, name]) => (
          <Link
            key={slug}
            href={href({ category: query.category === slug ? null : slug })}
            aria-current={query.category === slug ? 'page' : undefined}
            className={chip(query.category === slug)}
          >
            {name}
          </Link>
        ))}
      </nav>

      <section className="rounded-card border-border bg-card border p-4">
        <FloorMap
          floor={active}
          category={query.category}
          now={now}
          mallHours={settings.hours}
        />
      </section>
    </div>
  );
}
