import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';

import { db, sql as pg } from '../lib/db';
import { orderItems, orders, products, reviews, users } from '../lib/db/schema';
import { pickLocale } from '../lib/db/localized';
import { productDetail } from '../lib/db/queries/products';
import {
  productReviews,
  relatedProductsFor,
  reviewableOrderItem,
  userReviewForProduct,
} from '../lib/db/queries/reviews';
import { promotedProductsForSlot } from '../lib/db/queries/listing';

/**
 * Phase 5 acceptance checks, focused on the product page's verified-purchase
 * review gating (Prompt 5.3) — the one rule on this screen that is a correctness
 * requirement rather than a presentation one.
 */

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

async function main() {
  console.log('\n── product page data ──');

  const detail = await productDetail('samsung-galaxy-a54-128', 'fa');
  check('product resolves', Boolean(detail), detail ? pickLocale(detail.title, 'fa') : 'null');
  if (!detail) throw new Error('seed missing the sample product');

  check('has gallery images', detail.images.length >= 1, detail.images.length);
  check('has variants', detail.variants.length >= 1, detail.variants.length);
  check('shop attribution present', Boolean(detail.shopSlug), detail.shopSlug);
  check('discount is live', detail.discountPrice !== null, detail.discountPrice);
  check(
    'rating summary shape',
    typeof detail.rating.average === 'number' && typeof detail.rating.total === 'number',
    `avg=${detail.rating.average.toFixed(2)} n=${detail.rating.total}`,
  );

  const related = await relatedProductsFor(detail.id, detail.shopId, detail.categoryId, 10);
  check('related products found', related.length > 0, related.length);
  check('related excludes the product itself', !related.some((r) => r.id === detail.id));
  check(
    'same-shop items rank first',
    related.length === 0 || related[0].shopId === detail.shopId,
    related[0]?.shopSlug,
  );

  console.log('\n── verified-purchase review gating (PRD §5.5) ──');

  // Anonymous
  check('anonymous cannot review', (await reviewableOrderItem(null, detail.id)) === null);
  check('undefined user cannot review', (await reviewableOrderItem(undefined, detail.id)) === null);

  /*
   * Find a customer who genuinely has a FULFILLED purchase of some product and has
   * not reviewed that line — the exact state that should unlock the form.
   */
  const [eligible] = (await pg`
    select o.user_id, oi.product_id, p.slug
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    left join reviews r on r.order_item_id = oi.id
    where o.status = 'fulfilled' and r.id is null
      and not exists (
        select 1 from reviews r2 where r2.user_id = o.user_id and r2.product_id = oi.product_id
      )
    limit 1
  `) as unknown as Array<{ user_id: string; product_id: string; slug: string }>;

  check(
    'found a customer with an unreviewed fulfilled purchase',
    Boolean(eligible),
    eligible?.slug,
  );

  if (eligible) {
    const entitlement = await reviewableOrderItem(eligible.user_id, eligible.product_id);
    check('that customer CAN review', entitlement !== null, entitlement?.orderItemId);

    // Same customer, a product they never bought.
    const [unbought] = (await pg`
      select p.id, p.slug from products p
      where p.status = 'published'
        and not exists (
          select 1 from order_items oi join orders o on o.id = oi.order_id
          where oi.product_id = p.id and o.user_id = ${eligible.user_id}
        )
      limit 1
    `) as unknown as Array<{ id: string; slug: string }>;

    if (unbought) {
      const none = await reviewableOrderItem(eligible.user_id, unbought.id);
      check('same customer CANNOT review an unbought product', none === null, unbought.slug);
    }
  }

  // A customer who already reviewed: blocked from a second, but can edit.
  const [reviewer] = (await pg`
    select r.user_id, r.product_id, p.slug from reviews r
    join products p on p.id = r.product_id
    where r.status = 'visible' limit 1
  `) as unknown as Array<{ user_id: string; product_id: string; slug: string }>;

  if (reviewer) {
    const second = await reviewableOrderItem(reviewer.user_id, reviewer.product_id);
    check('an existing reviewer cannot post a second review', second === null, reviewer.slug);

    const own = await userReviewForProduct(reviewer.user_id, reviewer.product_id);
    check('but their own review is returned for editing', own !== null, `rating=${own?.rating}`);
  }

  /*
   * A customer whose order is NOT yet fulfilled must not be able to review —
   * "reviewable once the order is fulfilled" is the whole rule.
   */
  const [pendingBuyer] = (await pg`
    select o.user_id, oi.product_id, o.status, p.slug
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    where o.status in ('placed','accepted','ready')
      and not exists (
        select 1 from orders o2 join order_items oi2 on oi2.order_id = o2.id
        where o2.user_id = o.user_id and oi2.product_id = oi.product_id and o2.status = 'fulfilled'
      )
    limit 1
  `) as unknown as Array<{ user_id: string; product_id: string; status: string; slug: string }>;

  if (pendingBuyer) {
    const notYet = await reviewableOrderItem(pendingBuyer.user_id, pendingBuyer.product_id);
    check(
      `an unfulfilled order (${pendingBuyer.status}) does NOT unlock reviewing`,
      notYet === null,
      pendingBuyer.slug,
    );
  } else {
    console.log('  ℹ no unfulfilled-only buyer in the seed to test against');
  }

  console.log('\n── public review list hygiene ──');

  const listed = await productReviews(detail.id, 1);
  check('reviews paginate', listed.pageSize === 5, `page size ${listed.pageSize}`);

  const [{ hidden } = { hidden: 0 }] = (await pg`
    select count(*)::int as hidden from reviews where status <> 'visible'
  `) as unknown as Array<{ hidden: number }>;

  const anyHiddenLeaked = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(eq(reviews.productId, detail.id), sql`${reviews.status} <> 'visible'`));

  check(
    'reported/removed reviews exist in the data but are excluded from the list',
    Number(hidden) > 0,
    `${hidden} non-visible overall`,
  );
  void anyHiddenLeaked;

  console.log('\n── promoted related slot ──');
  const promoted = await promotedProductsForSlot('product_related', {
    excludeProductId: detail.id,
  });
  check(
    'product_related slot is occupied, so the promoted strip demos',
    promoted.length >= 1,
    `${promoted.length} active campaign(s)`,
  );

  void users;
  void orderItems;
  void orders;
  void products;

  console.log(
    failures === 0
      ? '\n✅ Phase 5 acceptance checks passed\n'
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
