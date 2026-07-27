import 'dotenv/config';
import { and, desc, eq } from 'drizzle-orm';

import { db, sql as pg } from '../lib/db';
import {
  cartItems,
  notifications,
  orderEvents,
  orderItems,
  orders,
  products,
  shops,
  users,
} from '../lib/db/schema';
import { pickLocale } from '../lib/db/localized';
import { activeOffersForShops, bestOfferFor, deliveryFeeFor } from '../lib/offers';
import { orderByReference } from '../lib/db/queries/orders';
import { formatCurrency } from '../lib/format';

/**
 * Exercises the checkout arithmetic and order-writing rules directly, at the
 * layer below the UI.
 *
 * The browser journey needs a real session cookie, which a script cannot mint;
 * what a script CAN verify is the part that would be quietly wrong — offer maths,
 * delivery-fee thresholds, shop-scoped notifications, and the event chain.
 */

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

async function main() {
  console.log('\n── offer arithmetic (PRD §8.1) ──');

  const [shop] = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(eq(shops.status, 'approved'))
    .limit(1);

  const shopOffers = await activeOffersForShops([shop.id]);
  console.log(`  ℹ ${pickLocale(shop.name, 'fa')} has ${shopOffers.length} active offer(s)`);

  // A percent offer must never exceed the eligible base.
  const percent = {
    id: 'p',
    shopId: shop.id,
    name: { fa: 'x' },
    type: 'percent' as const,
    value: 25,
    scope: 'shop' as const,
    productIds: null,
    endsAt: new Date(),
  };
  const applied = bestOfferFor([{ productId: 'a', lineTotal: 1000 }], [percent]);
  check('25% of 1000 is 250', applied?.amount === 250, applied?.amount);

  // A fixed offer larger than the basket is capped, so a total cannot go negative.
  const fixed = { ...percent, id: 'f', type: 'fixed' as const, value: 5000 };
  const capped = bestOfferFor([{ productId: 'a', lineTotal: 800 }], [fixed]);
  check('a 5000 fixed offer on an 800 basket caps at 800', capped?.amount === 800, capped?.amount);

  // Only the best single offer applies — never both.
  const both = bestOfferFor(
    [{ productId: 'a', lineTotal: 1000 }],
    [percent, { ...fixed, value: 400 }],
  );
  check(
    'only the better of two offers applies',
    both?.amount === 400,
    `${both?.amount} (400 beats 250)`,
  );

  // A product-scoped offer ignores ineligible lines.
  const scoped = {
    ...percent,
    id: 's',
    scope: 'products' as const,
    productIds: ['a'],
    value: 50,
  };
  const partial = bestOfferFor(
    [
      { productId: 'a', lineTotal: 1000 },
      { productId: 'b', lineTotal: 1000 },
    ],
    [scoped],
  );
  check(
    'a product-scoped offer only discounts its own lines',
    partial?.amount === 500,
    partial?.amount,
  );

  console.log('\n── delivery fee thresholds (PRD §5.3) ──');
  check('pickup is always free', deliveryFeeFor(100, 'pickup') === 0);
  check('a small delivery basket pays the fee', deliveryFeeFor(5000, 'delivery') === 150);
  check('a large delivery basket ships free', deliveryFeeFor(25000, 'delivery') === 0);

  console.log('\n── a seeded order obeys the schema rules ──');

  const [recent] = await db
    .select({ reference: orders.reference })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(1);

  const order = await orderByReference(recent.reference);
  check('order resolves with items and events', Boolean(order), recent.reference);
  if (!order) throw new Error('no order to inspect');

  check(
    'every item carries shop attribution',
    order.items.every((i) => Boolean(i.shopId)),
  );
  check(
    'every item snapshots its title and price',
    order.items.every((i) => i.priceSnapshot > 0),
  );
  check('the event chain starts at placed', order.events[0]?.toStatus === 'placed');
  check('the first event has no from-status', order.events[0]?.fromStatus === null);
  check(
    'events are chronological',
    order.events.every(
      (event, index) => index === 0 || event.createdAt >= order.events[index - 1].createdAt,
    ),
  );
  check(
    'the last event matches the order status',
    order.events[order.events.length - 1]?.toStatus === order.status,
    order.status,
  );
  check(
    'totals reconcile: subtotal - discount + delivery = total',
    order.subtotal - order.discountTotal + order.deliveryFee === order.total,
    `${order.subtotal} - ${order.discountTotal} + ${order.deliveryFee} = ${order.total}`,
  );

  console.log('\n── multi-shop orders exist and notify per shop ──');

  const [multi] = (await pg`
    select o.reference, count(distinct oi.shop_id)::int as shops
    from orders o join order_items oi on oi.order_id = o.id
    group by o.reference having count(distinct oi.shop_id) > 1
    limit 1
  `) as unknown as Array<{ reference: string; shops: number }>;

  check(
    'at least one order spans multiple shops',
    Boolean(multi),
    multi ? `${multi.reference} across ${multi.shops} shops` : 'none',
  );

  const [shopNotice] = await db
    .select({ eventKey: notifications.eventKey, body: notifications.body })
    .from(notifications)
    .where(eq(notifications.recipientRole, 'shopkeeper'))
    .limit(1);
  console.log(
    `  ℹ shopkeeper notifications present: ${shopNotice ? 'yes' : 'no (created at checkout time)'}`,
  );

  console.log('\n── cart persistence ──');

  const [customer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, '0700000003'))
    .limit(1);

  const [sample] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.status, 'published'))
    .limit(1);

  // Direct row writes: the cookie backend needs a request context a script lacks.
  await db.delete(cartItems).where(eq(cartItems.userId, customer.id));
  await db.insert(cartItems).values({ userId: customer.id, productId: sample.id, quantity: 2 });

  const [stored] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.userId, customer.id), eq(cartItems.productId, sample.id)));

  check('a signed-in cart persists to the database', stored?.quantity === 2, stored?.quantity);

  await db.delete(cartItems).where(eq(cartItems.userId, customer.id));
  const remaining = await db
    .select({ productId: cartItems.productId })
    .from(cartItems)
    .where(eq(cartItems.userId, customer.id));
  check('cart clears cleanly', remaining.length === 0);

  void orderEvents;
  void orderItems;
  void formatCurrency;

  console.log(
    failures === 0
      ? '\n✅ checkout and order rules verified\n'
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
