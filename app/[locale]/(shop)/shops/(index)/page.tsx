import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Store } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SearchBox } from '@/components/custom/search-box';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { ShopCategoryChips } from '@/components/shop/shop-category-chips';
import { ShopGrid, ShopGridSkeleton } from '@/components/shop/shop-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { promotedShopsForDirectory } from '@/lib/db/queries/listing';
import { recordImpressions } from '@/lib/db/queries/promoted';
import { searchShops } from '@/lib/db/queries/search';
import { categoryBySlug, categoryTree, shopDirectory } from '@/lib/db/queries/shops';
import { formatNumber } from '@/lib/format';
import { MALL_FLOORS } from '@/lib/mall-floors';

/**
 * Shop directory (PRD §5.1) — a first-class listing, not a list.
 *
 * Same shape as a category page, because that is what it is: a header that says
 * how much is here, a way to search it, a scope row across the top, then a
 * featured strip and the grid. It used to be a search box and eight cards.
 *
 * The grid is GROUPED BY FLOOR and uses ShopCard's compact row — see the note
 * on `groups` below for why the building's own structure beats a rating sort
 * here. A SEARCH is ungrouped: a term is not a place, and scattering four
 * matches across three floor headings hides the thing that was asked for.
 *
 * The FEATURED STRIP is a revenue surface (PRD §8.2): shops holding a live
 * `directory_top` placement render first, larger and badged. It is bounded by
 * the slot's capacity and it never reorders the organic list beneath it, which
 * stays sorted purely on derived rating (PRD §8.4).
 *
 * It is hidden while a category filter is on. A paid placement is bought
 * against the DIRECTORY, and surfacing an electronics shop at the top of a
 * filtered view of grocers is not the thing that was sold.
 */
export default async function ShopsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q, category } = await searchParams;
  const t = await getTranslations('shops');

  const tree = await categoryTree(locale);

  /* The clock is read ONCE, here, and handed down — the same rule the shop page
     follows. Reading it inside each card would let two vacation-mode chips on
     one screen disagree, and a clock read during a component's render is a React
     19 purity violation (CLAUDE.md). */
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <DirectoryHeader locale={locale} category={category} />
      </Suspense>

      <SearchBox placeholder={t('searchPlaceholder')} />

      <ShopCategoryChips categories={tree} active={category} />

      <Suspense fallback={<ShopGridSkeleton layout="row" />}>
        <Directory locale={locale} q={q} category={category} now={now} />
      </Suspense>
    </div>
  );
}

async function DirectoryHeader({ locale, category }: { locale: string; category?: string }) {
  const t = await getTranslations('shops');
  const categoryRow = category ? await categoryBySlug(category) : null;
  const shops = await shopDirectory({ locale, categoryId: categoryRow?.id });

  return (
    <div>
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {/* The count IS the subtitle. "Browse the mall's shops" says nothing a
            visitor cannot see; "14 shops in the mall" is the fact they came for. */}
        {t('shopCount', {
          // `n` pluralises, `count` renders — see lib/db/queries/dashboard.ts.
          n: shops.length,
          count: formatNumber(shops.length, locale),
        })}
      </p>
    </div>
  );
}

async function Directory({
  locale,
  q,
  category,
  now,
}: {
  locale: string;
  q?: string;
  category?: string;
  now: Date;
}) {
  const t = await getTranslations('shops');
  const tCommon = await getTranslations('common');
  const tFloors = await getTranslations('floors');
  const term = q?.trim();

  // A search narrows to trigram matches; otherwise the full directory.
  if (term) {
    const results = await searchShops(term, { limit: 30 });
    if (results.length === 0) {
      return (
        <EmptyState
          illustration={<Store className="h-7 w-7" />}
          title={t('noResultsTitle', { term })}
          description={t('noResultsBody')}
          action={{ label: t('clearSearch'), href: '/shops' }}
        />
      );
    }
    return <ShopGrid items={results} now={now} />;
  }

  const categoryRow = category ? await categoryBySlug(category) : null;
  const [promoted, organic] = await Promise.all([
    categoryRow ? Promise.resolve([]) : promotedShopsForDirectory(),
    shopDirectory({ locale, categoryId: categoryRow?.id }),
  ]);

  const promotedIds = new Set(promoted.map((shop) => shop.id));
  const rest = organic.filter((shop) => !promotedIds.has(shop.id));

  if (organic.length === 0 && promoted.length === 0) {
    return (
      <EmptyState
        illustration={<Store className="h-7 w-7" />}
        title={t('emptyCategoryTitle')}
        description={t('emptyCategoryBody')}
        // One tap back to the whole directory — an empty filtered view whose
        // only exit is the back button is where a session ends.
        action={{ label: t('allCategories'), href: '/shops' }}
      />
    );
  }

  void recordImpressions(promoted.map((shop) => shop.campaignId));

  /*
   * GROUPED BY FLOOR, because that is the map the customer already has.
   *
   * Gulbahar Center is a building with three trading floors, and a visitor who
   * has ever been inside it navigates by them — «طبقه دوم» is where the phone
   * shops are, and knowing that is worth more than knowing which shop has 4.6
   * stars. A flat grid sorted on derived rating threw that structure away and
   * offered nothing in its place: fourteen equally-weighted cards in an order
   * whose logic is invisible from the outside.
   *
   * The rating order SURVIVES INSIDE each floor, so the grouping costs nothing
   * — the best-rated shop on a floor is still its first card.
   *
   * MALL_FLOORS rather than the floors the data happens to hold: an empty third
   * floor is a fact about the mall, and deriving the headings from the shops
   * would silently delete a floor from the building's map. Empty ones are
   * dropped from the RENDER (a heading over nothing is not a fact worth
   * stating) but the list is what defines the order.
   */
  const groups = MALL_FLOORS.map((floor) => ({
    floor,
    shops: rest.filter((shop) => shop.floor === floor),
  })).filter((group) => group.shops.length > 0);

  // Anything the mall has not placed on a known floor. Never dropped — a shop
  // missing from the directory because its floor column is null is a shop that
  // has effectively been unpublished by a data gap.
  const unplaced = rest.filter(
    (shop) => shop.floor === null || !MALL_FLOORS.includes(shop.floor as (typeof MALL_FLOORS)[number]),
  );

  return (
    <div className="space-y-6">
      {promoted.length > 0 && (
        <section className="rounded-panel space-y-3 bg-neutral-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{t('featuredHeading')}</h2>
            <SponsoredBadge />
            <span className="text-xs text-neutral-600">{t('promotedNote')}</span>
          </div>
          {/*
            Three across rather than the organic grid's four, so a featured card
            is visibly larger. The badge says it is paid; the size is what makes
            the placement worth paying for.
          */}
          <ShopGrid
            items={promoted.map((shop) => ({ ...shop, sponsored: true }))}
            columns="featured"
            now={now}
          />
        </section>
      )}

      {groups.map((group) => (
        <section key={group.floor} className="space-y-3">
          <h2 className="text-foreground flex items-baseline gap-2 text-base font-bold">
            {tCommon('floorName', { floor: group.floor })}
            {/* `floors.shopsOnFloor` — «۴ دکان» — and NOT this page's own
                `shopCount`, which reads «۴ دکان در مرکز گلبهار»: under a floor
                heading that sentence names the wrong place, and the mall is
                already the subject of the page. */}
            <span className="text-muted-foreground text-xs font-normal">
              {tFloors('shopsOnFloor', { count: formatNumber(group.shops.length, locale) })}
            </span>
          </h2>
          <ShopGrid items={group.shops} layout="row" hideFloor now={now} />
        </section>
      ))}

      {unplaced.length > 0 && <ShopGrid items={unplaced} layout="row" now={now} />}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
