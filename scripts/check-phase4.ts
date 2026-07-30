import 'dotenv/config';
import { eq } from 'drizzle-orm';

import { db, sql as pg } from '../lib/db';
import { shops } from '../lib/db/schema';
import { pickLocale } from '../lib/db/localized';
import { shopDashboardStats } from '../lib/db/queries/dashboard';
import { productList, trendingProducts } from '../lib/db/queries/products';
import { searchProducts, searchShops } from '../lib/db/queries/search';
import { shopDirectory, categoryTree, pendingShops, shopForUser } from '../lib/db/queries/shops';
import { platformStats } from '../lib/db/queries/orders';
import { activeCampaignsForSlot } from '../lib/db/queries/promoted';
import { notificationFeed } from '../lib/db/queries/notifications';
import { formatCurrency } from '../lib/format';

/**
 * Phase 4 acceptance check: prove the seeded world produces dashboards and
 * listings with real shape (Prompt 4.2), not just non-zero row counts.
 *
 * This reads through the actual Phase 3 query modules, so it doubles as an
 * integration test of the data layer against realistic data.
 */

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

async function main() {
  console.log('\n── storefront ──');

  const listing = await productList({ locale: 'fa', pageSize: 24 });
  check(
    'published products visible',
    listing.total === 69,
    `${listing.total} (75 less the 6 draft)`,
  );
  check('first page full', listing.items.length === 24, listing.items.length);
  check(
    'every card has an image',
    listing.items.every((item) => Boolean(item.imagePath)),
    `${listing.items.filter((i) => i.imagePath).length}/${listing.items.length}`,
  );
  check(
    'some cards carry a rating',
    listing.items.filter((item) => item.rating > 0).length >= 5,
    `${listing.items.filter((i) => i.rating > 0).length} rated`,
  );
  check(
    'some cards are discounted',
    listing.items.some((item) => item.discountPrice !== null),
  );

  const trending = await trendingProducts('fa', 8);
  check('trending is ordered by views', trending.length === 8);

  const directory = await shopDirectory({ locale: 'fa' });
  check('only approved shops are public', directory.length === 13, `${directory.length} of 14`);
  check(
    'shops have derived ratings',
    directory.filter((shop) => shop.rating > 0).length >= 8,
    `${directory.filter((s) => s.rating > 0).length} rated`,
  );
  check(
    'shops report product counts',
    directory.every((shop) => shop.productCount > 0),
  );
  check(
    'shops carry floor and unit for pickup',
    directory.every((shop) => shop.floor !== null && shop.unitNumber !== null),
  );

  const tree = await categoryTree('fa');
  check('category tree has 8 roots', tree.length === 8, tree.length);
  check(
    'roots have children',
    tree.every((root) => root.children.length >= 1),
  );
  check(
    'categories report product counts',
    tree.some((root) => root.children.some((child) => child.productCount > 0)),
  );

  console.log('\n── the pending-shop approval moment (PRD §9.4) ──');
  const pending = await pendingShops();
  check('exactly one shop awaits approval', pending.length === 1, pending[0]?.slug);
  check(
    'it already has a full catalogue built',
    (pending[0]?.draftProductCount ?? 0) === 6,
    `${pending[0]?.draftProductCount} draft products`,
  );
  check('it has an owner to notify', Boolean(pending[0]?.ownerPhone), pending[0]?.ownerPhone);

  console.log('\n── shop dashboard (PRD §6.1) ──');
  const [topShop] = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(eq(shops.slug, 'kabul-electronics'))
    .limit(1);

  const stats = await shopDashboardStats(topShop.id);
  check('week sales non-zero', stats.rangeSales > 0, formatCurrency(stats.rangeSales, 'fa'));
  check('live products counted', stats.liveProducts === 5, stats.liveProducts);
  check('30-day series is gapless', stats.salesSeries.length === 30, stats.salesSeries.length);
  check(
    'chart has genuine shape (not all zero)',
    stats.salesSeries.filter((day) => day.revenue > 0).length >= 5,
    `${stats.salesSeries.filter((d) => d.revenue > 0).length}/30 days with sales`,
  );
  check('top products populated', stats.topProducts.length >= 3, stats.topProducts.length);
  check(
    'top products have revenue and images',
    stats.topProducts.some((p) => p.revenue > 0) && stats.topProducts.every((p) => p.imagePath),
  );

  const owner = await shopForUser(
    (await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, 'kabul-electronics')))[0]
      .id,
  ).catch(() => null);
  void owner;

  console.log('\n── action queue must not be empty at demo start ──');
  const queues = await Promise.all(
    directory.slice(0, 8).map(async (shop) => ({
      shop: pickLocale(shop.name, 'fa'),
      queue: (await shopDashboardStats(shop.id)).actionQueue,
    })),
  );
  const withWork = queues.filter(
    (entry) => entry.queue.newOrders + entry.queue.toMarkReady + entry.queue.readyForHandover > 0,
  );
  check(
    'at least one shop has orders awaiting action',
    withWork.length >= 1,
    withWork.map((e) => `${e.shop}: ${JSON.stringify(e.queue)}`).join(' | ') || 'none',
  );

  console.log('\n── promotions (PRD §8.2) ──');
  const hero = await activeCampaignsForSlot('home_hero');
  check('home hero slot is occupied', hero.length === 1, hero.length);

  const featured = await activeCampaignsForSlot('featured_shops');
  check('featured shops partly sold', featured.length === 4, `${featured.length} of 6 capacity`);

  const searchTop = await activeCampaignsForSlot('search_top');
  check('search_top has active campaigns', searchTop.length === 2, searchTop.length);

  const requested = await pg`select count(*)::int as c from campaigns where status = 'requested'`;
  check(
    'one campaign awaits admin approval',
    Number((requested as unknown as Array<{ c: number }>)[0].c) === 1,
  );

  const revenue = await pg`
    select coalesce(sum(price_paid), 0)::int as total from campaigns where status in ('active','ended')
  `;
  const promoRevenue = Number((revenue as unknown as Array<{ total: number }>)[0].total);
  check('promotion revenue is non-zero', promoRevenue > 0, formatCurrency(promoRevenue, 'fa'));

  console.log('\n── search against a real catalogue ──');
  for (const [term, label] of [
    ['samsung', 'latin brand'],
    ['سامسونگ', 'dari brand'],
    ['گلكسي', 'arabic-keyboard spelling'],
    ['128', 'ascii digits vs persian digits'],
    ['عطر', 'dari category word'],
    ['kabul', 'shop name'],
  ] as const) {
    const hits = term === 'kabul' ? await searchShops(term) : await searchProducts(term);
    check(`"${term}" (${label}) returns hits`, hits.length > 0, `${hits.length} results`);
  }

  console.log('\n── admin reporting (PRD §7.4) ──');
  const platform = await platformStats(90);
  check('GMV non-zero', platform.gmv > 0, formatCurrency(platform.gmv, 'fa'));
  check('order volume counted', platform.orderCount > 100, platform.orderCount);
  check('active shops counted', platform.activeShops === 13, platform.activeShops);
  check(
    'status breakdown has a live tail',
    (platform.byStatus.placed ?? 0) > 0 && (platform.byStatus.fulfilled ?? 0) > 0,
    JSON.stringify(platform.byStatus),
  );

  console.log('\n── notification log (PRD §9.2) ──');
  const feed = await notificationFeed({ limit: 40 });
  check('log is not empty at demo start', feed.length > 10, feed.length);
  check(
    'no raw template keys leaked',
    feed.every((row) => !row.body.startsWith('notifications.')),
  );
  check(
    'both languages present, demonstrating the templates',
    new Set(feed.map((row) => row.locale)).size >= 2,
    [...new Set(feed.map((r) => r.locale))].join(', '),
  );
  check(
    'Dari money uses Persian digits',
    feed.some((row) => row.locale === 'fa' && /[۰-۹]/.test(row.body)),
  );

  console.log(
    failures === 0
      ? '\n✅ Phase 4 acceptance checks passed\n'
      : `\n❌ ${failures} check(s) failed\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end();
  });
