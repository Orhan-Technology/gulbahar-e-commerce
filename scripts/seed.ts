import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { desc, eq } from 'drizzle-orm';
import path from 'node:path';

import { db, sql as pg } from '../lib/db';
import {
  addresses,
  campaigns,
  categories,
  notifications,
  offers,
  orderEvents,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
  reviewResponses,
  reviews,
  shopMembers,
  shops,
  users,
  wishlistItems,
  type LocalizedText,
  type OrderStatus,
  type PromotionSlotKey,
} from '../lib/db/schema';
import { promotionSlots } from '../lib/db/schema';
import { renderTemplate, type NotificationEventKey } from '../lib/notify';
import { formatCurrency } from '../lib/format';
import { pickLocale } from '../lib/db/localized';
import {
  ADDRESS_LABELS,
  FEMALE_FIRST,
  KABUL_DISTRICTS,
  MALE_FIRST,
  OFFER_NAMES,
  RESPONSES_FA,
  REVIEWS_EN,
  REVIEWS_FA,
  STREET_DETAILS,
  SURNAMES,
} from './seed-data/people';

/**
 * Seeds the demo world (PRD §9.4 — seeding is a deliverable, not an afterthought).
 *
 * DETERMINISTIC BY DESIGN. Everything random comes from a seeded PRNG, so every
 * run produces byte-identical data. The presenter rehearses against specific
 * orders and specific numbers; a reset that reshuffles the world mid-rehearsal
 * would undermine the whole point of the demo control panel.
 *
 * `NOW` is also fixed per run from the wall clock once, so all relative dates in
 * one seeded world are consistent with each other.
 */

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32). Small, fast, and good enough for seed data.
// ---------------------------------------------------------------------------
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makeRandom(20260727);

const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const intBetween = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const chance = (probability: number) => rand() < probability;

function sample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
}

const NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number, hour = 12, minute = 0) => {
  const date = new Date(NOW.getTime() - days * DAY_MS);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
};

const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);

// ---------------------------------------------------------------------------
// Seed content types
// ---------------------------------------------------------------------------
type CategorySeed = {
  slug: string;
  name: LocalizedText;
  children: Array<{ slug: string; name: LocalizedText }>;
};

type ShopSeed = {
  slug: string;
  category: string;
  floor: number;
  unit: string;
  name: LocalizedText;
  description: LocalizedText;
  hours: string;
  phone: string;
  status?: 'pending';
};

type ProductSeed = {
  slug: string;
  shopSlug: string;
  categorySlug: string;
  title: LocalizedText;
  description: LocalizedText;
  price: number;
  discountPrice: number | null;
  stock: number;
  variants: Array<{ name: LocalizedText; options: LocalizedText[] }>;
  viewCount: number;
};

type ImageManifest = {
  shops: Record<string, { logoPath: string; bannerPath: string }>;
  products: Record<string, { path: string; variants: Record<string, string>; images?: string[] }>;
};

/** Slot inventory and flat weekly pricing (PRD §8.2, §8.3). */
const SLOTS: Array<{
  key: PromotionSlotKey;
  name: LocalizedText;
  capacity: number;
  pricePerWeek: number;
}> = [
  {
    key: 'home_hero',
    name: { fa: 'بنر صفحه اصلی', en: 'Home hero banner' },
    capacity: 1,
    pricePerWeek: 12000,
  },
  {
    key: 'featured_shops',
    name: { fa: 'دکان‌های ویژه', en: 'Featured shops carousel' },
    capacity: 6,
    pricePerWeek: 5000,
  },
  {
    key: 'search_top',
    name: { fa: 'بالای نتایج جستجو', en: 'Top of search results' },
    capacity: 3,
    pricePerWeek: 6000,
  },
  {
    key: 'category_top',
    name: { fa: 'بالای صفحه دسته‌بندی', en: 'Top of category listing' },
    capacity: 3,
    pricePerWeek: 4500,
  },
  {
    key: 'product_related',
    name: { fa: 'محصولات مرتبط', en: 'Related products' },
    capacity: 2,
    pricePerWeek: 3000,
  },
  {
    key: 'directory_top',
    name: { fa: 'بالای فهرست دکان‌ها', en: 'Top of shop directory' },
    capacity: 3,
    pricePerWeek: 3500,
  },
];

async function main() {
  const started = Date.now();
  const contentDir = path.join(process.cwd(), 'content', 'seed');

  const [categorySeed, shopSeed, productSeed, manifest] = await Promise.all([
    readJson<CategorySeed[]>(path.join(contentDir, 'categories.json')),
    readJson<ShopSeed[]>(path.join(contentDir, 'shops.json')),
    readJson<ProductSeed[]>(path.join(contentDir, 'products.json')),
    readJson<ImageManifest>(path.join(contentDir, 'image-manifest.json')).catch(() => null),
  ]);

  if (!manifest) {
    throw new Error(
      'content/seed/image-manifest.json is missing. Run `npm run db:seed:images` first, ' +
        'or `npm run db:setup` to do both.',
    );
  }

  console.log('\nSeeding the Gulbahar demo world…\n');

  // ---------------------------------------------------------------- categories
  const categoryIds = new Map<string, string>();
  for (const [index, parent] of categorySeed.entries()) {
    const [row] = await db
      .insert(categories)
      .values({ slug: parent.slug, name: parent.name, sort: index })
      .returning();
    categoryIds.set(parent.slug, row.id);

    for (const [childIndex, child] of parent.children.entries()) {
      const [childRow] = await db
        .insert(categories)
        .values({ slug: child.slug, name: child.name, parentId: row.id, sort: childIndex })
        .returning();
      categoryIds.set(child.slug, childRow.id);
    }
  }
  const categoryCount = categoryIds.size;

  // -------------------------------------------------------------------- users
  // Fixed demo numbers are documented in the README so the presenter never has
  // to look them up mid-walkthrough.
  const [admin] = await db
    .insert(users)
    .values({ phone: '0700000001', name: 'مدیریت گلبهار', role: 'admin', locale: 'fa' })
    .returning();

  const shopkeeperRows = await db
    .insert(users)
    .values(
      shopSeed.map((shop, index) => ({
        // First shopkeeper gets the memorable number; the rest follow the block.
        phone: index === 0 ? '0700000002' : `07001002${String(index + 1).padStart(2, '0')}`,
        name: `${pick(MALE_FIRST)} ${pick(SURNAMES)}`,
        role: 'shopkeeper' as const,
        locale: index % 7 === 0 ? ('en' as const) : ('fa' as const),
      })),
    )
    .returning();

  const customerRows = await db
    .insert(users)
    .values(
      Array.from({ length: 25 }, (_, index) => ({
        phone: index === 0 ? '0700000003' : `07002003${String(index + 1).padStart(2, '0')}`,
        name: `${chance(0.45) ? pick(FEMALE_FIRST) : pick(MALE_FIRST)} ${pick(SURNAMES)}`,
        role: 'customer' as const,
        // A few English-preferring customers, so the notification log shows both.
        locale: index % 8 === 0 ? ('en' as const) : ('fa' as const),
      })),
    )
    .returning();

  // A staff member on the first approved shop, besides the owner (PRD §9.4).
  const [staffUser] = await db
    .insert(users)
    .values({
      phone: '0700000004',
      name: `${pick(MALE_FIRST)} ${pick(SURNAMES)}`,
      role: 'shopkeeper',
      locale: 'fa',
    })
    .returning();

  // ---------------------------------------------------------------- addresses
  const addressRows = await db
    .insert(addresses)
    .values(
      customerRows.flatMap((customer) =>
        Array.from({ length: chance(0.4) ? 2 : 1 }, () => ({
          userId: customer.id,
          label: pick(ADDRESS_LABELS),
          district: pick(KABUL_DISTRICTS),
          streetDetails: pick(STREET_DETAILS),
          phone: customer.phone,
        })),
      ),
    )
    .returning();

  const addressesByUser = new Map<string, typeof addressRows>();
  for (const address of addressRows) {
    const list = addressesByUser.get(address.userId) ?? [];
    list.push(address);
    addressesByUser.set(address.userId, list);
  }

  // -------------------------------------------------------------------- shops
  const shopIds = new Map<string, string>();
  for (const [index, shop] of shopSeed.entries()) {
    const images = manifest.shops[shop.slug];
    const [row] = await db
      .insert(shops)
      .values({
        slug: shop.slug,
        // 13 approved + 1 pre-staged pending shop for the live approval moment.
        status: shop.status === 'pending' ? 'pending' : 'approved',
        name: shop.name,
        description: shop.description,
        categoryId: categoryIds.get(shop.category) ?? null,
        floor: shop.floor,
        unitNumber: shop.unit,
        phone: shop.phone,
        hours: shop.hours,
        logoPath: images?.logoPath ?? null,
        bannerPath: images?.bannerPath ?? null,
        createdAt: daysAgo(shop.status === 'pending' ? 2 : 120 - index * 3),
      })
      .returning();
    shopIds.set(shop.slug, row.id);

    await db
      .insert(shopMembers)
      .values({ shopId: row.id, userId: shopkeeperRows[index].id, role: 'owner' });

    if (index === 0) {
      await db.insert(shopMembers).values({ shopId: row.id, userId: staffUser.id, role: 'staff' });
    }
  }

  const pendingShopSlug = shopSeed.find((shop) => shop.status === 'pending')!.slug;

  // ----------------------------------------------------------------- products
  /*
   * A handful of deliberately sold-out products, drawn from the two busiest shops
   * so the shopkeeper the presenter signs in as actually has some.
   */
  const soldOutSlugs = new Set(
    productSeed
      .filter((product) => ['kabul-electronics', 'markaz-mobile'].includes(product.shopSlug))
      .filter((_product, index) => index % 3 === 2)
      .map((product) => product.slug),
  );

  const productIds = new Map<string, string>();
  const productBySlug = new Map<string, ProductSeed>();

  for (const product of productSeed) {
    const shopId = shopIds.get(product.shopSlug)!;
    const isPendingShop = product.shopSlug === pendingShopSlug;

    const [row] = await db
      .insert(products)
      .values({
        shopId,
        slug: product.slug,
        title: product.title,
        description: product.description,
        categoryId: categoryIds.get(product.categorySlug) ?? null,
        price: product.price,
        discountPrice: product.discountPrice,
        /*
         * Every third product in the top two shops is forced out of stock.
         *
         * The authored catalogue gives everything positive stock, which left the
         * "out of stock products" item in the shop dashboard's action queue
         * permanently at zero and made the storefront's in-stock filter a no-op.
         * The action queue is the dashboard centrepiece (PRD §6.1), so it needs a
         * real example of every row type it can show.
         */
        stock: soldOutSlugs.has(product.slug) ? 0 : product.stock,
        // The pending shop has its whole catalogue ready but unpublished, so
        // approval genuinely flips one switch (PRD §7.1).
        status: isPendingShop ? 'draft' : 'published',
        viewCount: product.viewCount,
        createdAt: daysAgo(intBetween(20, 110)),
      })
      .returning();

    productIds.set(product.slug, row.id);
    productBySlug.set(product.slug, product);

    const image = manifest.products[product.slug];
    // `images` carries every generated angle; `path` is the legacy single-image
    // field, kept as a fallback so an older manifest still seeds.
    const paths = image?.images ?? (image ? [image.path] : []);
    if (paths.length > 0) {
      await db.insert(productImages).values(
        paths.map((path, sort) => ({
          productId: row.id,
          path,
          sort,
          alt: product.title,
        })),
      );
    }

    for (const [variantIndex, variant] of product.variants.entries()) {
      await db.insert(productVariants).values({
        productId: row.id,
        name: variant.name,
        options: variant.options,
        sort: variantIndex,
      });
    }
  }

  // Only published products can be ordered or reviewed.
  const sellable = productSeed.filter((product) => product.shopSlug !== pendingShopSlug);

  // Top 5 shops take a disproportionate share of orders, which is what makes the
  // admin's "top shops" report and the revenue view read as real (PRD §9.4).
  const topShopSlugs = shopSeed.slice(0, 5).map((shop) => shop.slug);

  // ------------------------------------------------------------------- orders
  const ORDER_TARGET = 220;
  let referenceCounter = 24000;
  const fulfilledItems: Array<{
    orderItemId: string;
    productSlug: string;
    shopSlug: string;
    userId: string;
    fulfilledAt: Date;
  }> = [];

  const orderStatusCounts: Record<string, number> = {};

  for (let index = 0; index < ORDER_TARGET; index += 1) {
    /*
     * Recency weighting: squaring a uniform draw biases toward 0, which maps to
     * "recent". Without this the 90-day history looks flat and the dashboard's
     * 30-day chart has no shape.
     */
    const dayOffset = Math.floor(Math.pow(rand(), 2) * 90);
    const placedAt = daysAgo(dayOffset, intBetween(8, 20), intBetween(0, 59));

    const customer = pick(customerRows);
    const fulfillment = chance(0.72) ? 'delivery' : 'pickup';
    const paymentMethod = chance(0.62) ? 'cod' : 'hesabpay';

    // Most baskets are single-shop; some span two, exercising the multi-shop cart.
    const shopCount = chance(0.18) ? 2 : 1;
    const chosenShops = sample(
      chance(0.6)
        ? topShopSlugs
        : shopSeed.filter((s) => s.status !== 'pending').map((s) => s.slug),
      shopCount,
    );

    const lines = chosenShops.flatMap((shopSlug) => {
      const shopProducts = sellable.filter((product) => product.shopSlug === shopSlug);
      if (shopProducts.length === 0) return [];
      return sample(shopProducts, intBetween(1, 2)).map((product) => ({
        product,
        quantity: chance(0.75) ? 1 : intBetween(2, 3),
      }));
    });

    if (lines.length === 0) continue;

    const subtotal = lines.reduce(
      (total, line) => total + (line.product.discountPrice ?? line.product.price) * line.quantity,
      0,
    );
    const deliveryFee = fulfillment === 'delivery' ? (subtotal > 20000 ? 0 : 150) : 0;

    /*
     * Status distribution. Orders older than a few days are settled; the last two
     * days carry the live tail of placed/accepted/ready that makes the shop
     * dashboard's action queue non-empty at demo start (PRD §9.4).
     */
    let status: OrderStatus;
    if (dayOffset <= 1) {
      status = pick(['placed', 'placed', 'accepted', 'ready', 'fulfilled'] as const);
    } else if (dayOffset <= 3) {
      status = pick(['accepted', 'ready', 'fulfilled', 'fulfilled'] as const);
    } else {
      status = chance(0.94) ? 'fulfilled' : 'rejected';
    }
    orderStatusCounts[status] = (orderStatusCounts[status] ?? 0) + 1;

    const customerAddresses = addressesByUser.get(customer.id) ?? [];
    const [order] = await db
      .insert(orders)
      .values({
        reference: `GC-${(referenceCounter += intBetween(1, 9))}`,
        userId: customer.id,
        status,
        fulfillment,
        paymentMethod,
        addressId:
          fulfillment === 'delivery' && customerAddresses.length > 0
            ? pick(customerAddresses).id
            : null,
        subtotal,
        discountTotal: 0,
        deliveryFee,
        total: subtotal + deliveryFee,
        createdAt: placedAt,
      })
      .returning();

    const insertedItems = await db
      .insert(orderItems)
      .values(
        lines.map((line) => ({
          orderId: order.id,
          shopId: shopIds.get(line.product.shopSlug)!,
          productId: productIds.get(line.product.slug)!,
          titleSnapshot: line.product.title,
          priceSnapshot: line.product.discountPrice ?? line.product.price,
          quantity: line.quantity,
        })),
      )
      .returning();

    // Append-only event chain with believable gaps between transitions.
    const chain: Array<{ from: OrderStatus | null; to: OrderStatus; at: Date }> = [
      { from: null, to: 'placed', at: placedAt },
    ];
    let cursor = placedAt;

    if (status === 'rejected') {
      cursor = plusMinutes(cursor, intBetween(20, 240));
      chain.push({ from: 'placed', to: 'rejected', at: cursor });
    } else {
      const order2: OrderStatus[] = ['accepted', 'ready', 'fulfilled'];
      const upto = order2.indexOf(status);
      const gaps = [intBetween(15, 180), intBetween(60, 420), intBetween(120, 2880)];
      let previous: OrderStatus = 'placed';
      for (let step = 0; step <= upto; step += 1) {
        cursor = plusMinutes(cursor, gaps[step]);
        chain.push({ from: previous, to: order2[step], at: cursor });
        previous = order2[step];
      }
    }

    await db.insert(orderEvents).values(
      chain.map((event) => ({
        orderId: order.id,
        fromStatus: event.from,
        toStatus: event.to,
        actorUserId: event.to === 'placed' ? customer.id : null,
        createdAt: event.at,
      })),
    );

    if (status === 'fulfilled') {
      const fulfilledAt = chain[chain.length - 1].at;
      for (const [lineIndex, item] of insertedItems.entries()) {
        fulfilledItems.push({
          orderItemId: item.id,
          productSlug: lines[lineIndex].product.slug,
          shopSlug: lines[lineIndex].product.shopSlug,
          userId: customer.id,
          fulfilledAt,
        });
      }
    }
  }

  // ------------------------------------------------------------------ reviews
  /*
   * Verified-purchase only: every review points at a fulfilled order_item, which
   * is the constraint the schema enforces (PRD §5.5). One review per customer per
   * product, so a customer who bought the same item twice cannot review it twice.
   */
  const REVIEW_TARGET = 90;
  const reviewable = sample(fulfilledItems, Math.min(REVIEW_TARGET * 2, fulfilledItems.length));
  const seenPair = new Set<string>();
  const createdReviews: Array<{ id: string; shopSlug: string; rating: number }> = [];

  for (const item of reviewable) {
    if (createdReviews.length >= REVIEW_TARGET) break;
    const pairKey = `${item.userId}:${item.productSlug}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);

    // Skew 4–5 with honest 2–3s, and the occasional 1.
    const roll = rand();
    const rating = roll < 0.46 ? 5 : roll < 0.76 ? 4 : roll < 0.9 ? 3 : roll < 0.97 ? 2 : 1;

    const useEnglish = chance(0.12) && REVIEWS_EN[rating];
    const body = useEnglish ? pick(REVIEWS_EN[rating]) : pick(REVIEWS_FA[rating]);

    const [row] = await db
      .insert(reviews)
      .values({
        productId: productIds.get(item.productSlug)!,
        userId: item.userId,
        orderItemId: item.orderItemId,
        rating,
        body,
        createdAt: new Date(item.fulfilledAt.getTime() + intBetween(1, 10) * DAY_MS),
      })
      .returning();

    createdReviews.push({ id: row.id, shopSlug: item.shopSlug, rating });
  }

  /*
   * Two reported reviews for the admin moderation queue (PRD §7.2, §9.4).
   *
   * Chosen after the fact from the lowest-rated reviews. An earlier version
   * decided this inline with `createdReviews.length < 2 && rating <= 2`, which
   * required a review to be BOTH among the first two created AND rated 1-2 —
   * and since ratings skew 4-5 that combination essentially never occurred, so
   * the moderation queue seeded empty and the demo moment had nothing to show.
   */
  const reportable = [...createdReviews].sort((a, b) => a.rating - b.rating).slice(0, 2);
  for (const review of reportable) {
    await db.update(reviews).set({ status: 'reported' }).where(eq(reviews.id, review.id));
  }

  // Ten shopkeeper responses (PRD §9.4). Never on a reported review.
  const reportedIds = new Set(reportable.map((review) => review.id));
  const toRespond = sample(
    createdReviews.filter((review) => !reportedIds.has(review.id)),
    10,
  );
  for (const review of toRespond) {
    await db.insert(reviewResponses).values({
      reviewId: review.id,
      shopId: shopIds.get(review.shopSlug)!,
      body: pick(RESPONSES_FA),
    });
  }

  // ---------------------------------------------------------------- wishlists
  const wishlistPairs = new Set<string>();
  const wishlistValues: Array<{ userId: string; productId: string; createdAt: Date }> = [];
  for (const customer of customerRows) {
    for (const product of sample(sellable, intBetween(1, 6))) {
      const key = `${customer.id}:${product.slug}`;
      if (wishlistPairs.has(key)) continue;
      wishlistPairs.add(key);
      wishlistValues.push({
        userId: customer.id,
        productId: productIds.get(product.slug)!,
        createdAt: daysAgo(intBetween(1, 60)),
      });
    }
  }
  await db.insert(wishlistItems).values(wishlistValues);

  // ------------------------------------------------------------------- offers
  const discountedBySlug = sellable.filter((product) => product.discountPrice);
  const offerValues = [
    // 5 active, one of them shop-wide.
    ...Array.from({ length: 5 }, (_, index) => {
      const shopSlug = shopSeed[index].slug;
      const shopProducts = discountedBySlug.filter((product) => product.shopSlug === shopSlug);
      const isShopWide = index === 2;
      return {
        shopId: shopIds.get(shopSlug)!,
        name: OFFER_NAMES[index],
        type: (index % 2 === 0 ? 'percent' : 'fixed') as 'percent' | 'fixed',
        value: index % 2 === 0 ? intBetween(10, 25) : intBetween(200, 900),
        scope: (isShopWide ? 'shop' : 'products') as 'shop' | 'products',
        productIds: isShopWide
          ? null
          : shopProducts.map((product) => productIds.get(product.slug)!),
        startsAt: daysAgo(intBetween(3, 14)),
        // Short windows so the storefront countdown chips are meaningful.
        endsAt: new Date(NOW.getTime() + intBetween(2, 12) * DAY_MS),
        active: true,
      };
    }),
    // 2 expired, so the shopkeeper's "expired" section is not empty.
    ...Array.from({ length: 2 }, (_, index) => ({
      shopId: shopIds.get(shopSeed[index + 5].slug)!,
      name: OFFER_NAMES[index + 5],
      type: 'percent' as const,
      value: intBetween(10, 20),
      scope: 'products' as const,
      productIds: [productIds.get(sellable[index].slug)!],
      startsAt: daysAgo(40),
      endsAt: daysAgo(intBetween(8, 20)),
      active: false,
    })),
  ];
  await db.insert(offers).values(offerValues);

  // --------------------------------------------------------------- promotions
  const slotIds = new Map<PromotionSlotKey, string>();
  for (const slot of SLOTS) {
    const [row] = await db.insert(promotionSlots).values(slot).returning();
    slotIds.set(slot.key, row.id);
  }

  const approvedShopSlugs = shopSeed
    .filter((shop) => shop.status !== 'pending')
    .map((shop) => shop.slug);

  type CampaignPlan = {
    slot: PromotionSlotKey;
    shopSlug: string;
    productSlug?: string;
    status: 'active' | 'requested' | 'ended';
  };

  const plans: CampaignPlan[] = [
    // Home hero occupied, so the storefront's most prominent slot is never empty.
    { slot: 'home_hero', shopSlug: approvedShopSlugs[0], status: 'active' },
    // 4 of 6 featured-shop slots taken — occupancy under capacity reads as real
    // inventory the admin can still sell (PRD §7.3 revenue view).
    ...approvedShopSlugs
      .slice(0, 4)
      .map((shopSlug): CampaignPlan => ({ slot: 'featured_shops', shopSlug, status: 'active' })),
    {
      slot: 'search_top',
      shopSlug: approvedShopSlugs[1],
      productSlug: sellable[6].slug,
      status: 'active',
    },
    {
      slot: 'search_top',
      shopSlug: approvedShopSlugs[3],
      productSlug: sellable[20].slug,
      status: 'active',
    },
    {
      slot: 'category_top',
      shopSlug: approvedShopSlugs[2],
      productSlug: sellable[12].slug,
      status: 'active',
    },
    // Related-products slot, so the product page's promoted strip is occupied —
    // PRD §9.4 wants every promoted slot visibly in use at demo start.
    {
      slot: 'product_related',
      shopSlug: approvedShopSlugs[4],
      productSlug: sellable[26].slug,
      status: 'active',
    },
    // One pending request for the admin approval moment (PRD §9.4).
    { slot: 'directory_top', shopSlug: approvedShopSlugs[7], status: 'requested' },
    // Two ended, so the revenue trend has history behind it.
    { slot: 'home_hero', shopSlug: approvedShopSlugs[5], status: 'ended' },
    { slot: 'featured_shops', shopSlug: approvedShopSlugs[6], status: 'ended' },
  ];

  for (const plan of plans) {
    const slot = SLOTS.find((entry) => entry.key === plan.slot)!;
    const weeks = intBetween(2, 8);

    const startsAt =
      plan.status === 'ended'
        ? daysAgo(intBetween(50, 80))
        : plan.status === 'requested'
          ? new Date(NOW.getTime() + 3 * DAY_MS)
          : daysAgo(intBetween(4, 20));

    const endsAt =
      plan.status === 'ended'
        ? new Date(startsAt.getTime() + weeks * 7 * DAY_MS)
        : new Date(NOW.getTime() + intBetween(3, 30) * DAY_MS);

    // Seeded metrics; real impression/click tracking is phase 2 (PRD §15).
    const impressions = plan.status === 'requested' ? 0 : intBetween(1800, 24000);
    const clicks =
      plan.status === 'requested' ? 0 : Math.floor(impressions * (0.012 + rand() * 0.05));

    await db.insert(campaigns).values({
      slotId: slotIds.get(plan.slot)!,
      shopId: shopIds.get(plan.shopSlug)!,
      productId: plan.productSlug ? productIds.get(plan.productSlug)! : null,
      status: plan.status,
      startsAt,
      endsAt,
      pricePaid: slot.pricePerWeek * weeks,
      impressions,
      clicks,
      createdAt: plan.status === 'requested' ? daysAgo(1) : startsAt,
    });
  }

  // ------------------------------------------------------------ notifications
  /*
   * Recent history so the log panel is not empty at demo start (PRD §9.4). Built
   * through the same renderTemplate() the live notify() uses, so seeded rows are
   * indistinguishable from ones created during the walkthrough.
   */
  const recentOrders = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      total: orders.total,
      userId: orders.userId,
      createdAt: orders.createdAt,
      // The shop name has to come from the order, not a constant: an English
      // recipient must read "Kabul Electronics", not the Dari name.
      shopName: shops.name,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(shops, eq(orderItems.shopId, shops.id))
    .orderBy(desc(orders.createdAt))
    .limit(14);

  const usersById = new Map(
    [...customerRows, ...shopkeeperRows, admin, staffUser].map((user) => [user.id, user]),
  );

  // Typed explicitly: inferring from the first element narrows role to 'customer'
  // and channel to 'sms', which then rejects the admin in-app notice appended below.
  type NotificationInsert = typeof notifications.$inferInsert;

  const notificationValues: NotificationInsert[] = recentOrders.flatMap((order) => {
    const customer = usersById.get(order.userId);
    const locale = (customer?.locale ?? 'fa') as 'fa' | 'en' | 'ps';

    const events: Array<{ key: NotificationEventKey; values: Record<string, string | number> }> = [
      {
        key: 'order.placed',
        // Money is pre-formatted so the SMS reads exactly like the UI: Persian
        // digits and a ؋ prefix in Dari, "AFN 1,250" in English.
        values: { reference: order.reference, total: formatCurrency(order.total, locale) },
      },
    ];
    if (order.status === 'accepted' || order.status === 'ready' || order.status === 'fulfilled') {
      events.push({
        key: 'order.accepted',
        values: {
          reference: order.reference,
          shopName: pickLocale(order.shopName, locale),
        },
      });
    }

    return events.map((event, index) => {
      const rendered = renderTemplate(event.key, locale, event.values);
      return {
        eventKey: event.key,
        recipientUserId: order.userId,
        recipientRole: 'customer' as const,
        channel: 'sms' as const,
        locale,
        title: rendered.title,
        body: rendered.body,
        payload: { ...event.values, orderId: order.id },
        read: chance(0.4),
        createdAt: plusMinutes(order.createdAt, index * 45),
      };
    });
  });

  // One shop-submitted notice sitting in the admin queue, matching the pending shop.
  const pendingShopName = shopSeed.find((shop) => shop.status === 'pending')!.name.fa;
  const submitted = renderTemplate('shop.submitted', 'fa', { shopName: pendingShopName });
  notificationValues.push({
    eventKey: 'shop.submitted',
    recipientUserId: admin.id,
    recipientRole: 'admin' as const,
    channel: 'inapp' as const,
    locale: 'fa',
    title: submitted.title,
    body: submitted.body,
    payload: { shopName: pendingShopName },
    read: false,
    createdAt: daysAgo(2, 10, 15),
  });

  await db.insert(notifications).values(notificationValues);

  // ------------------------------------------------------------------ summary
  const counts = await rowCounts();
  console.log('Row counts:');
  for (const [table, total] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(18)} ${total}`);
  }

  console.log('\nShape checks:');
  console.log(`  categories          ${categoryCount} (8 parents + 16 children)`);
  console.log(`  order statuses      ${JSON.stringify(orderStatusCounts)}`);
  console.log(`  reviews created     ${createdReviews.length} (target ${REVIEW_TARGET})`);
  console.log(`  reported reviews    ${reportable.length} (admin moderation queue)`);
  console.log(`  fulfilled items     ${fulfilledItems.length} reviewable`);
  console.log(`  wishlist rows       ${wishlistValues.length}`);
  console.log(`  out-of-stock        ${soldOutSlugs.size} products (action queue)`);

  console.log('\nDemo sign-in numbers (any 6-digit code from the notification log):');
  console.log('  admin        0700000001');
  console.log('  shopkeeper   0700000002  (owner of الکترونیک کابل)');
  console.log('  staff        0700000004  (same shop, staff role)');
  console.log('  customer     0700000003');

  console.log(`\n✓ seeded in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function rowCounts(): Promise<Record<string, number>> {
  const rows = (await pg`
    select 'users' as t, count(*)::int as c from users
    union all select 'shops', count(*)::int from shops
    union all select 'shop_members', count(*)::int from shop_members
    union all select 'categories', count(*)::int from categories
    union all select 'products', count(*)::int from products
    union all select 'product_images', count(*)::int from product_images
    union all select 'product_variants', count(*)::int from product_variants
    union all select 'orders', count(*)::int from orders
    union all select 'order_items', count(*)::int from order_items
    union all select 'order_events', count(*)::int from order_events
    union all select 'reviews', count(*)::int from reviews
    union all select 'review_responses', count(*)::int from review_responses
    union all select 'wishlist_items', count(*)::int from wishlist_items
    union all select 'offers', count(*)::int from offers
    union all select 'promotion_slots', count(*)::int from promotion_slots
    union all select 'campaigns', count(*)::int from campaigns
    union all select 'notifications', count(*)::int from notifications
    union all select 'addresses', count(*)::int from addresses
  `) as unknown as Array<{ t: string; c: number }>;

  return Object.fromEntries(rows.map((row) => [row.t, Number(row.c)]));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end();
  });
