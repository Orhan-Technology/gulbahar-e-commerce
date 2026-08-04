import Image from 'next/image';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Building2, ChevronLeft, MapPin, Store } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { FloorMap } from '@/components/shop/floor-map';
import { ScrollFade } from '@/components/shop/listing/scroll-fade';
import { pressable } from '@/components/motion/pressable';
import { pickLocale } from '@/lib/db/localized';
import { mallMap, type MapFloor } from '@/lib/db/queries/mall';
import { siteSettings } from '@/lib/db/queries/settings';
import { formatNumber, formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { openState } from '@/lib/opening';
import { cn } from '@/lib/utils';

type Query = { floor?: string; category?: string; unit?: string };

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

  /*
   * The occupied units of the active floor, narrowed by the category chip.
   * The MAP dims rather than removes — a map that changes shape when you filter
   * it stops being a map — but a LIST is not a map, and a list of shops that do
   * not match the filter is just noise beside it.
   */
  const tenants = active.units.filter(
    (
      entry,
    ): entry is typeof entry & { shop: NonNullable<(typeof entry)['shop']> } =>
      Boolean(entry.shop) &&
      (!query.category || entry.shop?.categorySlug === query.category),
  );

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

  /*
   * The unit whose panel is open, from `?unit=`.
   *
   * Read off the floor the page ALREADY loaded rather than queried: the panel's
   * whole content is one entry of `active.units`, so selecting a unit costs
   * nothing beyond the render it triggers. A stale or vacant unit number
   * resolves to null and the panel falls back to its prompt, which is the right
   * answer for a shared link to a shop that has since moved out.
   */
  const selected =
    active.units.find(
      (entry): entry is typeof entry & { shop: NonNullable<(typeof entry)['shop']> } =>
        Boolean(entry.shop) && entry.unit === Number(query.unit),
    ) ?? null;

  const href = (next: { floor?: number; category?: string | null; unit?: number | null }) => {
    const floor = next.floor ?? active.floor;
    const category = next.category === null ? undefined : (next.category ?? query.category);
    // A unit belongs to a floor and to a filter, so changing either drops it —
    // otherwise switching floors leaves a panel open on a shop that is not on
    // the floor being shown.
    const unit = next.unit ?? undefined;
    return `/floors?floor=${floor}${category ? `&category=${category}` : ''}${
      unit ? `&unit=${unit}` : ''
    }`;
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

      {/* Eleven chips in a row that has to clip somewhere: the fade is what
          tells the reader the eleventh exists. */}
      <ScrollFade label={t('allCategories')}>
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
      </ScrollFade>

      {/*
       * MAP AND PANEL, side by side from `lg`.
       *
       * The plan is about 400px tall and the page was a thousand pixels of
       * nothing beside it — so the widest screen got the least out of the one
       * feature Amazon cannot copy. The panel turns the plan from a diagram
       * into a browsing surface: click a unit, read who is there, click the
       * next one. Below `lg` the grid collapses to one column and the panel is
       * not rendered at all (see FloorUnitLink for why a phone keeps
       * navigating).
       *
       * `items-start` so the panel does not stretch to the map's height and
       * float its content in the middle of an empty box.
       */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-card border-border bg-card border p-4">
          <FloorMap
            floor={active}
            category={query.category}
            highlightUnit={selected?.unit ?? null}
            now={now}
            mallHours={settings.hours}
            panelHref={(unit) => href({ unit })}
          />
        </section>

        <UnitPanel entry={selected} now={now} mallHours={settings.hours} />
      </div>

      {/*
        THE MAP IS NOT A DIRECTORY, and this page shipped as though it were.
        Twenty-seven dashed empty units and four shops, then a thousand pixels
        of nothing — which means the only way to find out what is on this floor
        was to hunt four tinted tiles among thirty-one and read a truncated name
        in a 10px face. The list underneath says every one of them in full, with
        the thing a person standing in the building actually needs next: what
        the shop sells, whether it is open right now, and a way in.
      */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">
          {t('shopsOnFloorHeading', { floor: formatNumber(active.floor, locale) })}
        </h2>

        {tenants.length === 0 ? (
          <EmptyState
            illustration={<Building2 className="h-7 w-7" aria-hidden />}
            title={t('emptyTitle')}
            description={t('emptyBody')}
            action={{ label: t('allCategories'), href: href({ category: null }) }}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tenants.map((entry) => {
              const open =
                openState(entry.shop.hours, now)?.open && openState(settings.hours, now)?.open;

              return (
                <li key={entry.unit}>
                  <Link
                    href={`/shops/${entry.shop.slug}`}
                    className={cn(
                      pressable,
                      'rounded-card border-border bg-card hover:border-primary hover:shadow-card group flex items-center gap-3 border p-3 transition-[border-color,box-shadow,scale] duration-150 ease-out',
                    )}
                  >
                    <span className="rounded-control bg-primary-50 text-primary-800 text-2xs flex h-11 w-11 shrink-0 items-center justify-center font-bold tabular-nums">
                      {formatUnitNumber(String(entry.unit), locale)}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        dir="auto"
                        className="text-foreground group-hover:text-primary truncate text-sm font-bold transition-colors duration-150"
                      >
                        {pickLocale(entry.shop.name, locale)}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {entry.shop.categoryName
                          ? pickLocale(entry.shop.categoryName, locale)
                          : t('unitLabel', {
                              unit: formatUnitNumber(String(entry.unit), locale),
                            })}
                      </span>
                    </span>

                    {open && (
                      <span className="rounded-pill bg-success-bg text-success text-2xs inline-flex shrink-0 items-center gap-1 px-2 py-0.5 font-medium">
                        <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden />
                        {t('legendOpen')}
                      </span>
                    )}

                    <span className="text-primary hidden shrink-0 items-center gap-1 text-xs font-semibold sm:inline-flex">
                      {t('openShop')}
                      <ChevronLeft className="h-4 w-4 ltr:rotate-180" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Who is in the selected unit — the panel beside the plan (`lg` and up).
 *
 * `hidden lg:block`: on a phone this content would sit under the map, pushing
 * it off screen the moment somebody used it, and the shop list below already
 * names every tenant in full. It is a desktop affordance for desktop space.
 *
 * Everything here comes from the unit the page already loaded. The one thing
 * the design review asked for that is NOT here is the shop's star rating —
 * `mallMap()` does not select it, and that query lives outside this pass's
 * scope. The panel says what it can back: who, what they sell, how much of it,
 * whether the doors are open right now, and the way in.
 */
async function UnitPanel({
  entry,
  now,
  mallHours,
}: {
  entry: (MapFloor['units'][number] & { shop: NonNullable<MapFloor['units'][number]['shop']> }) | null;
  now: Date;
  mallHours: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('floors');
  const tShop = await getTranslations('shop');

  const surface = 'rounded-card border-border bg-card hidden border p-4 lg:block';

  if (!entry) {
    return (
      <aside className={cn(surface, 'text-muted-foreground text-sm')}>
        <MapPin className="mb-2 h-5 w-5 text-neutral-300" aria-hidden />
        {t('pickUnit')}
      </aside>
    );
  }

  const open = openState(entry.shop.hours, now)?.open && openState(mallHours, now)?.open;

  return (
    <aside className={cn(surface, 'space-y-3')}>
      <div className="flex items-center gap-3">
        <span className="rounded-control bg-primary-100 relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden">
          {entry.shop.logoPath ? (
            <Image src={entry.shop.logoPath} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <Store className="text-primary-700 h-5 w-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          {/* `dir="auto"`: the tenant's own name, in either script. */}
          <p dir="auto" className="text-foreground truncate text-sm font-bold">
            {pickLocale(entry.shop.name, locale)}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {t('unitLabel', { unit: formatUnitNumber(String(entry.unit), locale) })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {open && (
          <span className="rounded-pill bg-success-bg text-success text-2xs inline-flex items-center gap-1 px-2 py-0.5 font-medium">
            <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden />
            {t('legendOpen')}
          </span>
        )}
        {entry.shop.categoryName && (
          <span className="rounded-pill text-2xs bg-neutral-100 px-2 py-0.5 text-neutral-600">
            {pickLocale(entry.shop.categoryName, locale)}
          </span>
        )}
        <span className="text-muted-foreground text-2xs tabular-nums">
          {tShop('productCount', { count: formatNumber(entry.shop.productCount, locale) })}
        </span>
      </div>

      <Link
        href={`/shops/${entry.shop.slug}`}
        className={cn(
          pressable,
          'rounded-control bg-primary text-primary-foreground hover:bg-primary-700 flex w-full items-center justify-center gap-1 px-3 py-2 text-sm font-semibold transition-[background-color,scale] duration-150 ease-out',
        )}
      >
        {t('openShop')}
        <ChevronLeft className="h-4 w-4 ltr:rotate-180" aria-hidden />
      </Link>
    </aside>
  );
}
