import 'dotenv/config';
import { eq, inArray, like, sql } from 'drizzle-orm';

import { db, sql as pg } from '../lib/db';
import {
  categories,
  notifications,
  orderEvents,
  orderItems,
  orders,
  products,
  shopMembers,
  shops,
  users,
} from '../lib/db/schema';
import { requestOtp, verifyOtp } from '../lib/auth/otp';
import { pickLocale, hasTranslation } from '../lib/db/localized';
import { shopDashboardStats } from '../lib/db/queries/dashboard';
import { productList, productDetail } from '../lib/db/queries/products';
import { searchProducts, searchShops } from '../lib/db/queries/search';
import { shopDirectory, shopForUser } from '../lib/db/queries/shops';
import { orderWithTimeline } from '../lib/db/queries/orders';
import { notificationFeed } from '../lib/db/queries/notifications';

/**
 * Phase 3 acceptance check (Prompt 3.2): create a user through the real OTP
 * flow, build a minimal shop/product/order graph, then read every query module
 * back. Cleans up after itself so it can be re-run.
 *
 * Run with: npx tsx scripts/check-phase3.ts
 */

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  const mark = condition ? '✓' : '✗';
  console.log(`  ${mark} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!condition) failures += 1;
}

/**
 * Removes anything a previous run left behind. Order matters: orders.user_id is
 * ON DELETE RESTRICT by design — order history must never vanish silently when a
 * user row goes away — so dependent rows are cleared before their owners.
 */
async function resetTestData(customerPhone: string) {
  const testPhones = [customerPhone, '0799000002'];

  const owners = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.phone, testPhones));
  const ownerIds = owners.map((row) => row.id);

  if (ownerIds.length > 0) {
    // order_items and order_events cascade from orders.
    await db.delete(orders).where(inArray(orders.userId, ownerIds));
  }

  const testShops = await db
    .select({ id: shops.id })
    .from(shops)
    .where(like(shops.slug, 'check-shop-%'));
  const shopIds = testShops.map((row) => row.id);
  if (shopIds.length > 0) {
    // Any order_items still pointing at these shops would block the delete.
    const shopOrderIds = await db
      .selectDistinct({ id: orderItems.orderId })
      .from(orderItems)
      .where(inArray(orderItems.shopId, shopIds));
    if (shopOrderIds.length > 0) {
      await db.delete(orders).where(
        inArray(
          orders.id,
          shopOrderIds.map((row) => row.id),
        ),
      );
    }
    // products cascade from shops, as do shop_members.
    await db.delete(shops).where(inArray(shops.id, shopIds));
  }

  await db.delete(categories).where(like(categories.slug, 'check-cat-%'));

  if (ownerIds.length > 0) {
    await db.delete(users).where(inArray(users.id, ownerIds));
  }

  await db.delete(notifications).where(eq(notifications.eventKey, 'otp'));
}

async function main() {
  const stamp = Date.now();
  const phone = '0799000001';

  console.log('\n── OTP flow ──');

  await resetTestData(phone);

  const requested = await requestOtp(phone);
  check('requestOtp accepted the number', requested.ok);

  /*
   * The code is only reachable via the notification log — exactly how the presenter
   * reads it during the demo. Must select the OTP row explicitly: seeded order
   * notifications carry timestamps spread across the whole day, so "the newest
   * notification" is a seeded row whenever the clock is earlier than the latest
   * seeded time.
   */
  const [otpRow] = (await notificationFeed({ limit: 60 })).filter((row) => row.eventKey === 'otp');
  check('OTP written to the notification log', otpRow?.eventKey === 'otp', otpRow?.body);

  const code = otpRow?.body.match(/(\d{6})/)?.[1] ?? '';
  check('6-digit code present in the rendered body', /^\d{6}$/.test(code), code);

  const wrong = await verifyOtp(phone, '000000' === code ? '111111' : '000000');
  check('a wrong code is rejected', wrong.ok === false, wrong.ok ? null : wrong.error);

  const verified = await verifyOtp(phone, code, { name: 'مشتری آزمایشی' });
  check('correct code signs in and creates the user', verified.ok);
  if (!verified.ok) throw new Error('OTP verification failed; aborting');

  const replay = await verifyOtp(phone, code);
  check('the same code cannot be replayed', replay.ok === false, replay.ok ? null : replay.error);

  const customerId = verified.user.id;

  console.log('\n── localized field helpers ──');
  const sample = { fa: 'ساعت مچی', en: 'Wristwatch' };
  check('pickLocale resolves fa', pickLocale(sample, 'fa') === 'ساعت مچی');
  check('pickLocale resolves en', pickLocale(sample, 'en') === 'Wristwatch');
  check('ps falls back to fa (PRD §11)', pickLocale(sample, 'ps') === 'ساعت مچی');
  check('hasTranslation reports the gap', hasTranslation(sample, 'ps') === false);

  console.log('\n── minimal shop graph ──');

  const [category] = await db
    .insert(categories)
    .values({ slug: `check-cat-${stamp}`, name: { fa: 'الکترونیک', en: 'Electronics' } })
    .returning();

  const [shopkeeper] = await db
    .insert(users)
    .values({ phone: '0799000002', name: 'دکاندار آزمایشی', role: 'shopkeeper' })
    .returning();

  const [shop] = await db
    .insert(shops)
    .values({
      slug: `check-shop-${stamp}`,
      status: 'approved',
      name: { fa: 'الکترونیک کابل', en: 'Kabul Electronics' },
      categoryId: category.id,
      floor: 2,
      unitNumber: '214',
    })
    .returning();

  await db.insert(shopMembers).values({ shopId: shop.id, userId: shopkeeper.id, role: 'owner' });

  const [product] = await db
    .insert(products)
    .values({
      shopId: shop.id,
      slug: `check-product-${stamp}`,
      title: { fa: 'سامسونگ گلکسی ۱۲۸ گیگ', en: 'Samsung Galaxy 128GB' },
      categoryId: category.id,
      price: 24500,
      discountPrice: 21000,
      stock: 7,
      status: 'published',
      viewCount: 120,
    })
    .returning();

  const [order] = await db
    .insert(orders)
    .values({
      reference: `GC-${stamp % 100000}`,
      userId: customerId,
      status: 'fulfilled',
      fulfillment: 'delivery',
      paymentMethod: 'hesabpay',
      subtotal: 21000,
      total: 21000,
    })
    .returning();

  await db.insert(orderItems).values({
    orderId: order.id,
    shopId: shop.id,
    productId: product.id,
    titleSnapshot: product.title,
    priceSnapshot: 21000,
    quantity: 1,
  });

  await db.insert(orderEvents).values([
    { orderId: order.id, fromStatus: null, toStatus: 'placed' },
    { orderId: order.id, fromStatus: 'placed', toStatus: 'accepted' },
    { orderId: order.id, fromStatus: 'accepted', toStatus: 'ready' },
    { orderId: order.id, fromStatus: 'ready', toStatus: 'fulfilled' },
  ]);

  console.log('\n── query modules ──');

  const shopLink = await shopForUser(shopkeeper.id);
  check('shopForUser resolves the owner link', shopLink?.shopId === shop.id, shopLink?.memberRole);

  /*
   * `sort: 'newest'` explicitly. The listing default is POPULARITY now
   * (PRD §5.1), and a product this script created a second ago has no views —
   * so it is nowhere near the first page of a popularity ranking. The check
   * means "the freshly published product is listed", so it should ask for the
   * order that answers that.
   */
  const listing = await productList({ locale: 'fa', pageSize: 10, sort: 'newest' });
  check(
    'productList returns the published product',
    listing.items.some((i) => i.id === product.id),
  );
  check(
    'listing carries a derived rating field',
    listing.items.every((i) => typeof i.rating === 'number'),
  );

  const detail = await productDetail(product.slug, 'fa');
  check('productDetail resolves shop attribution', detail?.shopId === shop.id);
  check('productDetail returns a rating summary', typeof detail?.rating.average === 'number');

  const directory = await shopDirectory({ locale: 'fa' });
  check(
    'shopDirectory includes the approved shop',
    directory.some((s) => s.id === shop.id),
  );

  const timeline = await orderWithTimeline(order.id);
  check('orderWithTimeline returns the full event chain', timeline?.events.length === 4);
  check('order items are shop-attributed', timeline?.items[0]?.shopId === shop.id);

  const stats = await shopDashboardStats(shop.id);
  check('dashboard: live products', stats.liveProducts === 1, stats.liveProducts);
  check('dashboard: week sales counted', stats.weekSales === 21000, stats.weekSales);
  check(
    'dashboard: 30-day series has no gaps',
    stats.salesSeries.length === 30,
    stats.salesSeries.length,
  );
  check('dashboard: top products populated', stats.topProducts.length >= 1);
  check(
    'dashboard: action queue shape',
    typeof stats.actionQueue.newOrders === 'number' &&
      typeof stats.ordersAwaitingAction === 'number',
    stats.actionQueue,
  );

  console.log('\n── trigram search (PRD §12.3) ──');

  const latinHit = await searchProducts('samsung');
  check(
    'English term finds the product',
    latinHit.some((r) => r.id === product.id),
  );

  const dariHit = await searchProducts('سامسونگ');
  check(
    'Dari term finds the same product',
    dariHit.some((r) => r.id === product.id),
  );

  const arabicKeyboard = await searchProducts('گلكسي');
  check(
    'Arabic-keyboard spelling still matches (ك/ي folded)',
    arabicKeyboard.some((r) => r.id === product.id),
  );

  const asciiDigits = await searchProducts('128');
  check(
    'ASCII digits match Persian digits in the title',
    asciiDigits.some((r) => r.id === product.id),
  );

  const typo = await searchProducts('samsng');
  check(
    'near-miss spelling still matches',
    typo.some((r) => r.id === product.id),
  );

  const shopHit = await searchShops('kabul');
  check(
    'shop search works',
    shopHit.some((s) => s.id === shop.id),
  );

  console.log('\n── index usage ──');
  // Confirms the query expression matches the index expression textually; if the
  // two ever drift, this drops to a Seq Scan and search silently gets slower.
  const plan = await db.execute(sql`
    explain select id from products
    where gulbahar_search_key(
      coalesce(title->>'fa', '') || ' ' || coalesce(title->>'en', '') || ' ' || coalesce(title->>'ps', '')
    ) like '%samsung%'
  `);
  const planText = (plan as unknown as Array<Record<string, string>>)
    .map((row) => Object.values(row)[0])
    .join('\n');
  console.log(
    `  ${planText.includes('products_title_trgm_idx') ? '✓ trigram index used' : '✗ index NOT used — expression drift'}\n     ${planText.replace(/\n/g, '\n     ')}`,
  );

  console.log('\n── cleanup ──');
  await resetTestData(phone);
  console.log('  ✓ test rows removed');

  console.log(
    failures === 0
      ? '\n✅ Phase 3 acceptance checks passed\n'
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
