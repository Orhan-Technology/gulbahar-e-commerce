import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
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
  productAnswers,
  productImages,
  productQuestions,
  productViewDays,
  productVariants,
  products,
  reviewResponses,
  reviews,
  adminAuditLog,
  searchQueries,
  shopFollows,
  shopReviewRows,
  shopMembers,
  shops,
  users,
  wishlistItems,
  type LocalizedText,
  type ProductAttribute,
  type ProductFeature,
  type OrderStatus,
  type PromotionSlotKey,
} from '../lib/db/schema';
import {
  platformSettings,
  promotionSlots,
  shopVerificationDocuments,
  shopVerifications,
} from '../lib/db/schema';
import { DEFAULT_SETTINGS } from '../lib/db/queries/settings';
import { specTemplateFor } from '../lib/product-templates';
import { generateCollectionCode } from '../lib/collection-code';
import { storeVerificationDocument } from '../lib/verification-storage';
import { orderReasonText } from '../lib/order-lifecycle';
import type { OrderRejectReason } from '../lib/order-reject-reasons';
import { renderTemplate, type NotificationEventKey } from '../lib/notify';
import faMessages from '../messages/fa.json';
import { formatCurrency, formatNumber } from '../lib/format';
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
  SHOP_REVIEWS_EN,
  SHOP_REVIEWS_FA,
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
const HOUR_MS = 60 * 60 * 1000;

/**
 * N days before the seed run, at a given wall-clock hour.
 *
 * CLAMPED TO THE PAST. Day 0 with an afternoon hour lands in the future when the
 * seed runs in the morning, and everything derived from it — order events, reviews,
 * their notifications — inherited that. Future-dated notifications sat pinned above
 * every live arrival in the demo log, which read as "the log is not real time".
 */
const daysAgo = (days: number, hour = 12, minute = 0) => {
  const date = new Date(NOW.getTime() - days * DAY_MS);
  date.setUTCHours(hour, minute, 0, 0);
  if (date.getTime() > NOW.getTime()) date.setTime(date.getTime() - DAY_MS);
  return date;
};

const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);

const sameUtcDay = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

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
  /** The About tab's longer copy (Prompt C8). */
  story: LocalizedText;
  /** Gregorian year this tenant took the unit — rendered as a duration. */
  since: number;
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
  products: Record<
    string,
    { path: string; variants: Record<string, string>; images?: string[]; blur?: string[] }
  >;
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

  const [categorySeed, shopSeed, productSeed, manifest, detailSeed] = await Promise.all([
    readJson<CategorySeed[]>(path.join(contentDir, 'categories.json')),
    readJson<ShopSeed[]>(path.join(contentDir, 'shops.json')),
    readJson<ProductSeed[]>(path.join(contentDir, 'products.json')),
    readJson<ImageManifest>(path.join(contentDir, 'image-manifest.json')).catch(() => null),
    /*
     * Specifications, features, brand and the long description live in their
     * own file rather than in products.json (Prompt P1): products.json is the
     * commercial record — price, stock, category — and this is the editorial
     * one. It is authored by scripts/author-product-details.py and covers every
     * product, which specs.json never did.
     */
    readJson<Record<string, ProductDetail>>(path.join(contentDir, 'product-details.json')),
  ]);

  if (!manifest) {
    throw new Error(
      'content/seed/image-manifest.json is missing. Run `npm run db:seed:images` first, ' +
        'or `npm run db:setup` to do both.',
    );
  }

  console.log('\nSeeding the Gulbahar demo world…\n');

  // ----------------------------------------------------------------- settings
  /*
   * The marketplace's own facts (A4). Seeded FIRST and with no PRNG draw of its
   * own: every order reference below comes out of the shared generator, and the
   * runbook names specific ones (GC-24788, GC-24338), so anything inserted
   * before them must not touch the draw sequence.
   *
   * These values are the ones the app previously hard-coded, so a seeded
   * database and a bare `db:push` render identically until the admin edits them.
   */
  await db.insert(platformSettings).values({ id: 1, ...DEFAULT_SETTINGS });

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
        /*
         * The PRIMARY demo customer (index 0, 0700000003) is Dari, because the
         * walkthrough is in Dari and their OTP and order messages are read aloud from
         * the notification log — an English SMS there reads as a bug to a Dari
         * audience. A few later customers prefer English so the log still shows both
         * templates side by side (PRD §9.2).
         */
        locale: index > 0 && index % 8 === 0 ? ('en' as const) : ('fa' as const),
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
  /** Who answers a question for each shop (Prompt P4). */
  const shopOwnerIds = new Map<string, string>();
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
        story: shop.story,
        // 1 Hamal-ish: the day of the year is noise, the year is the fact.
        tenantSince: new Date(Date.UTC(shop.since, 2, 21)),
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
    shopOwnerIds.set(shop.slug, shopkeeperRows[index].id);

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
         *
         * STOCK HERE MEANS AVAILABLE NOW, not the shelf total. Live checkout
         * reserves stock at placement and gives it back on reject/cancel/hold
         * expiry, so the units held by the seeded in-flight orders below have
         * already been taken off these numbers — which is why the seed does NOT
         * decrement again for them. Three seeded products have in-flight orders
         * larger than their remaining stock, so a decrementing pass would drive
         * them negative and trip `products_stock_non_negative`. The consequence
         * to expect, and it is the correct one: cancelling a seeded in-flight
         * order raises that product's stock, because the goods go back on the
         * shelf.
         */
        stock: soldOutSlugs.has(product.slug) ? 0 : product.stock,
        ...productDetail(product, detailSeed[product.slug]),
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
          // Generated alongside the file by db:seed:images; absent on an older
          // manifest, which simply means no blur-up for that image.
          blurDataUrl: image?.blur?.[sort] ?? null,
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

  /** One row per (fulfilled order, shop) — what a SHOP review is earned by. */
  const fulfilledOrdersByShop: Array<{
    orderId: string;
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
    let placedAt = daysAgo(dayOffset, intBetween(8, 20), intBetween(0, 59));

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
    /*
     * Hoisted out of the insert literal, in the SAME evaluation order the literal
     * had (reference draw, then address pick, then the chain's gap draws that used
     * to happen after the inserts). The PRNG call sequence is load-bearing: order
     * references like GC-24788 are named in docs/DEMO-RUNBOOK.md, and one extra or
     * reordered draw renumbers every order after it.
     */
    const reference = `GC-${(referenceCounter += intBetween(1, 9))}`;
    const chosenAddress =
      fulfillment === 'delivery' && customerAddresses.length > 0
        ? pick(customerAddresses)
        : null;
    const rejectionGap = status === 'rejected' ? intBetween(20, 240) : 0;
    const chainGaps =
      status === 'rejected'
        ? []
        : [intBetween(15, 180), intBetween(60, 420), intBetween(120, 2880)];

    /*
     * A chain can run ~2 days past placedAt (the fulfilled gap alone is up to 48h),
     * so even a same-day order can produce events dated tomorrow. Compute where the
     * chain will END and shift the whole order back by whole days until it fits —
     * whole days, so the believable wall-clock hours survive the shift.
     */
    {
      const order2: OrderStatus[] = ['accepted', 'ready', 'fulfilled'];
      const steps = status === 'rejected' ? 1 : order2.indexOf(status) + 1;
      const totalMinutes =
        status === 'rejected'
          ? rejectionGap
          : chainGaps.slice(0, steps).reduce((sum, gap) => sum + gap, 0);
      const chainEnd = placedAt.getTime() + totalMinutes * 60 * 1000;
      const ceiling = NOW.getTime() - 5 * 60 * 1000;
      const available = ceiling - placedAt.getTime();

      if (chainEnd > ceiling) {
        if (status !== 'rejected' && sameUtcDay(placedAt, NOW) && available > 20 * 60 * 1000) {
          /*
           * An order placed EARLIER TODAY is compressed into the hours it has
           * left rather than pushed into yesterday.
           *
           * Shifting whole days is right for the rest of the history, but
           * applied to today it empties today of finished orders — the chain
           * alone can run 48 hours, so almost every same-day fulfilled order
           * was moved off the day it was drawn for. Every shop's "today's
           * sales" then read ؋۰ at demo start, on the LEAD TILE of the
           * dashboard, and the number a shopkeeper opens the app for was
           * always zero.
           *
           * Scaling the drawn gaps keeps their proportions — accept quickly,
           * ready slower, hand over slowest — and consumes no random numbers,
           * so every order reference is unchanged.
           */
          const scale = available / (chainEnd - placedAt.getTime());
          for (let step = 0; step < chainGaps.length; step += 1) {
            chainGaps[step] = Math.max(1, Math.round(chainGaps[step] * scale));
          }
        } else {
          const shiftDays = Math.ceil((chainEnd - ceiling) / DAY_MS);
          placedAt = new Date(placedAt.getTime() - shiftDays * DAY_MS);
        }
      }
    }

    const [order] = await db
      .insert(orders)
      .values({
        reference,
        userId: customer.id,
        status,
        fulfillment,
        paymentMethod,
        addressId: chosenAddress?.id ?? null,
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
      cursor = plusMinutes(cursor, rejectionGap);
      chain.push({ from: 'placed', to: 'rejected', at: cursor });
    } else {
      const order2: OrderStatus[] = ['accepted', 'ready', 'fulfilled'];
      const upto = order2.indexOf(status);
      let previous: OrderStatus = 'placed';
      for (let step = 0; step <= upto; step += 1) {
        cursor = plusMinutes(cursor, chainGaps[step]);
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

      /*
       * The ORDER, once per shop it touched — the entitlement a shop review is
       * written against (Prompt C8). Recorded here rather than re-derived later
       * because it costs no random draw: adding one inside this loop would
       * renumber every order reference the runbook names (CLAUDE.md).
       */
      for (const shopSlug of new Set(lines.map((line) => line.product.shopSlug))) {
        fulfilledOrdersByShop.push({ orderId: order.id, shopSlug, userId: customer.id, fulfilledAt });
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
  const createdReviews: Array<{
    id: string;
    shopSlug: string;
    rating: number;
    productSlug: string;
    createdAt: Date;
  }> = [];

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
        /*
         * 1–10 days after fulfilment, CAPPED IN THE PAST: a recent order would
         * otherwise carry a review dated next week. The clamp is deterministic —
         * an extra rand() draw here would renumber everything seeded after it.
         */
        createdAt: (() => {
          const raw = item.fulfilledAt.getTime() + intBetween(1, 10) * DAY_MS;
          const cap = NOW.getTime() - 6 * 60 * 60 * 1000;
          const floor = item.fulfilledAt.getTime() + 2 * 60 * 60 * 1000;
          const clamped = Math.max(Math.min(raw, cap), floor);
          return new Date(Math.min(clamped, NOW.getTime() - 30 * 60 * 1000));
        })(),
      })
      .returning();

    createdReviews.push({
      id: row.id,
      shopSlug: item.shopSlug,
      rating,
      productSlug: item.productSlug,
      createdAt: row.createdAt,
    });
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

  /*
   * The report NOTIFICATION, not just the flag.
   *
   * Setting `status = 'reported'` alone reproduces the row but not the act: a
   * real report is a shopkeeper choosing a category and admin reading it, and
   * the moderation queue recovers that category from this notification's
   * payload. Seeding the status without it left the demo's queue showing two
   * reported reviews with no stated reason — the one screen whose entire job is
   * judging a reason.
   *
   * Written straight into the array the notification section inserts later,
   * and it consumes NO random draws, so every order reference the runbook names
   * is unchanged.
   */
  const seededReportReasons = ['not_a_customer', 'offensive'] as const;
  const flagReasonLabels = faMessages.shopReviews.flagReasons as Record<string, string>;
  const flaggedReports = reportable.map((review, index) => {
    const reasonKey = seededReportReasons[index % seededReportReasons.length];
    const values = {
      shopName: shopSeed.find((shop) => shop.slug === review.shopSlug)?.name.fa ?? '',
      productTitle: productBySlug.get(review.productSlug)?.title.fa ?? '',
      /*
       * BOTH the rendered label and the code it came from.
       *
       * `reason` is what the notification body reads, so it has to be the Dari
       * label. `reasonCode` is what the moderation queue translates, and it has
       * to be the enum key — storing only the label made that screen print the
       * raw key path «adminReviews.reportReasons.این شخص از ما خرید نکرده» on
       * the single most decision-relevant line it has.
       */
      reason: flagReasonLabels[reasonKey],
      reasonCode: reasonKey,
      note: '',
      reviewId: review.id,
    };
    const rendered = renderTemplate('review.flagged', 'fa', values);
    return {
      eventKey: 'review.flagged' as const,
      recipientUserId: null,
      recipientRole: 'admin' as const,
      channel: 'inapp' as const,
      locale: 'fa' as const,
      title: rendered.title,
      body: rendered.body,
      payload: values,
      read: false,
      // A shop reports a review shortly after reading it, not months later.
      createdAt: new Date(
        Math.min(review.createdAt.getTime() + 3 * 60 * 60 * 1000, NOW.getTime() - 20 * 60 * 1000),
      ),
    };
  });

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
        /*
         * The first offer is the FLASH sale, ending in HOURS. The storefront's
         * "today's best deals" band pins its countdown to the soonest-ending
         * live offer, and a chip reading «۴ روز باقی مانده» is a date, not a
         * countdown — the urgency the band is built around only exists if
         * something really is about to expire. The rest run for days, so the
         * band still has depth once the flash lapses.
         *
         * Same single draw either way, so the offer values above are unchanged.
         */
        endsAt:
          index === 0
            ? new Date(NOW.getTime() + intBetween(2, 12) * HOUR_MS)
            : new Date(NOW.getTime() + intBetween(2, 12) * DAY_MS),
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
    /** Set only on the historical run below; see HISTORY_MONTHS. */
    monthsAgo?: number;
  };

  /*
   * How many months back each historical placement starts — roughly one a month
   * a year ago rising to three recently. The admin revenue screen charts twelve
   * months, and without a year of history behind the live campaigns nine of its
   * twelve bars are empty, which reads as a broken chart rather than as a young
   * business. A rising shape tells the true story instead: the mall started
   * selling placements slowly and the business is growing.
   */
  const HISTORY_MONTHS = [
    11, 11, 10, 10, 9, 9, 8, 8, 8, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1,
  ];

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

    /*
     * A year of ended placements behind the live ones. APPENDED, never
     * interleaved: every plan above keeps the exact PRNG draws it had, so the
     * hero campaign, the ؋۱۴٬۰۰۰ request the runbook names, and the two ended
     * campaigns are all byte-identical to before.
     *
     * Slots and shops are cycled rather than drawn, so the history spreads
     * evenly across the mall's inventory and its tenants without spending a
     * single random number — which is what keeps the append safe.
     */
    ...HISTORY_MONTHS.map(
      (monthsAgo, index): CampaignPlan => ({
        slot: SLOTS[index % SLOTS.length].key,
        shopSlug: approvedShopSlugs[index % approvedShopSlugs.length],
        status: 'ended',
        monthsAgo,
      }),
    ),
  ];

  for (const plan of plans) {
    const slot = SLOTS.find((entry) => entry.key === plan.slot)!;
    const weeks = intBetween(2, 8);

    const startsAt =
      plan.monthsAgo !== undefined
        ? // Anywhere within that month, so the twelve-month chart is not a
          // picket fence of placements all booked on the first.
          daysAgo(plan.monthsAgo * 30 + intBetween(0, 27))
        : plan.status === 'ended'
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

  /*
   * Two LIVE placements in the shop directory (PRD §5.1, §8.2).
   *
   * The slot has always existed and had a pending request against it for the
   * admin approval moment, but nothing active — so the featured strip at the top
   * of /shops was a branch that could never render, on a revenue surface. Two
   * running campaigns make it a real one.
   *
   * Written as a fixed insert AFTER the loop rather than as two more entries in
   * `plans`, and that is the whole point: every plan draws from rand() inside
   * that loop, so two extra iterations would shift every draw made after it —
   * the notification read-flags among them. Nothing here is random. The shops
   * and durations are chosen, the prices follow from the slot's own rate, and
   * the metrics are stated.
   */
  const DIRECTORY_FEATURED: Array<{ shopSlug: string; weeks: number; impressions: number }> = [
    { shopSlug: approvedShopSlugs[1], weeks: 4, impressions: 9400 },
    { shopSlug: approvedShopSlugs[3], weeks: 6, impressions: 12600 },
  ];

  const directorySlot = SLOTS.find((entry) => entry.key === 'directory_top')!;

  for (const [index, featured] of DIRECTORY_FEATURED.entries()) {
    const startsAt = daysAgo(9 + index * 4);
    await db.insert(campaigns).values({
      slotId: slotIds.get('directory_top')!,
      shopId: shopIds.get(featured.shopSlug)!,
      productId: null,
      status: 'active',
      startsAt,
      endsAt: new Date(NOW.getTime() + (12 + index * 5) * DAY_MS),
      pricePaid: directorySlot.pricePerWeek * featured.weeks,
      impressions: featured.impressions,
      // A shade over 3%, which is where the other seeded placements land.
      clicks: Math.round(featured.impressions * 0.031),
      createdAt: startsAt,
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
        // Even a clamped order sits close to NOW; +45min per step must not cross it.
        createdAt: new Date(
          Math.min(
            plusMinutes(order.createdAt, index * 45).getTime(),
            NOW.getTime() - (2 + index) * 60 * 1000,
          ),
        ),
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

  /*
   * THE DEMO CUSTOMER'S OWN BELL (Prompt C12).
   *
   * The block above addresses whoever placed the fourteen most recent orders,
   * and the draw rarely put the demo customer among them — so the storefront
   * bell, the surface where a customer reads about their own order, opened
   * empty. These are their own orders, so every reference resolves and every
   * deep link lands.
   */
  const demoCustomerRow = customerRows.find((row) => row.phone === '0700000003')!;
  /*
   * ONE ROW PER ORDER. The shop name arrives as a correlated subquery rather
   * than a join: joining order_items to reach it multiplies the row by the
   * number of lines, and this loop writes a notification chain per row — so a
   * two-line order got its whole chain twice, and the duplicates ate the LIMIT
   * that newer orders needed. Nine of eighteen cards on the customer's bell
   * were the same message printed again.
   */
  const demoCustomerOrders = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      total: orders.total,
      status: orders.status,
      createdAt: orders.createdAt,
      fulfillment: orders.fulfillment,
      collectionCode: orders.collectionCode,
      holdExpiresAt: orders.holdExpiresAt,
      /*
       * `orders.id` written out rather than interpolated: drizzle renders the
       * column unqualified here, and inside a subquery that already has `shops`
       * and `order_items` in scope a bare "id" is ambiguous — Postgres refuses
       * the whole query.
       */
      shopName: sql<LocalizedText>`(
        select s.name from shops s
        join order_items oi on oi.shop_id = s.id
        where oi.order_id = orders.id
        order by s.slug asc
        limit 1
      )`,
    })
    .from(orders)
    .where(eq(orders.userId, demoCustomerRow.id))
    .orderBy(desc(orders.createdAt))
    .limit(6);

  const alreadyNotified = new Set(
    notificationValues
      .map((row) => (row.payload as Record<string, string> | null)?.reference)
      .filter(Boolean),
  );

  /*
   * THE WHOLE CHAIN, not just "placed".
   *
   * This loop used to write one `order.placed` per order whatever the order's
   * actual state was, so the customer's bell held four identical "your order
   * was placed" cards while one of those orders was sitting READY behind the
   * counter with a collection code — the single most demo-worthy message the
   * product can send, and nothing announced it. The events now follow the
   * order's real status, which is also what makes the bell's deep links land on
   * something worth reading.
   */
  const holdHours = DEFAULT_SETTINGS.pickupHoldHours ?? 24;
  const chainFor = (order: (typeof demoCustomerOrders)[number]) => {
    const steps: Array<{ key: NotificationEventKey; values: Record<string, string | number> }> = [
      {
        key: 'order.placed',
        values: { reference: order.reference, total: formatCurrency(order.total, 'fa') },
      },
    ];
    const shopName = pickLocale(order.shopName, 'fa');

    if (['accepted', 'ready', 'fulfilled'].includes(order.status)) {
      steps.push({ key: 'order.accepted', values: { reference: order.reference, shopName } });
    }
    if (['ready', 'fulfilled'].includes(order.status)) {
      steps.push({
        key: 'order.ready',
        values: {
          reference: order.reference,
          shopName,
          fulfillment: order.fulfillment,
          // Only a pickup order has these, and only the pickup branch reads them.
          collectionCode: order.collectionCode ?? '',
          // Pre-formatted, like every money value in this file. A bare number
          // reaches ICU as a plain substitution, so «۴۸» arrived as "48" —
          // Latin digits sitting inside a Dari sentence.
          holdHours: formatNumber(holdHours, 'fa'),
        },
      });
    }
    if (order.status === 'fulfilled') {
      steps.push({ key: 'order.fulfilled', values: { reference: order.reference } });
    }
    return steps;
  };

  for (const [index, order] of demoCustomerOrders.entries()) {
    if (alreadyNotified.has(order.reference)) continue;

    for (const [step, event] of chainFor(order).entries()) {
      const rendered = renderTemplate(event.key, 'fa', event.values);

      notificationValues.push({
        eventKey: event.key,
        recipientUserId: demoCustomerRow.id,
        recipientRole: 'customer' as const,
        // 'sms' is how it WOULD have gone out; nothing is ever really sent in
        // this build, and the bell shows it regardless (Prompt C12).
        channel: 'sms' as const,
        locale: 'fa',
        title: rendered.title,
        body: rendered.body,
        payload: { ...event.values, orderId: order.id },
        // The newest order's last message stays unread so the bell opens with a
        // count on the thing the customer most wants to see.
        read: !(index === 0 && step === chainFor(order).length - 1),
        createdAt: new Date(
          Math.min(
            order.createdAt.getTime() + (step + 1) * 60 * 60 * 1000,
            NOW.getTime() - (4 + (chainFor(order).length - step)) * 60 * 1000,
          ),
        ),
      });
    }
  }

  /*
   * THE DEMO SHOPKEEPER'S OWN BELL (Prompt C12).
   *
   * The block above addresses the CUSTOMER on each recent order, and the draw
   * had put almost none of those on the demo accounts — so the shop panel's
   * bell opened empty on the one console the walkthrough spends most of its
   * time in. These are the shopkeeper's side of orders that already exist, at
   * the demo shop, so nothing here is invented: every reference resolves and
   * every deep link lands on a real row.
   */
  const demoShopId = shopIds.get(shopSeed[0].slug)!;
  const demoOwnerId = shopOwnerIds.get(shopSeed[0].slug)!;

  const demoShopOrders = await db
    .selectDistinct({
      id: orders.id,
      reference: orders.reference,
      total: orders.total,
      createdAt: orders.createdAt,
      status: orders.status,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orderItems.shopId, demoShopId))
    .orderBy(desc(orders.createdAt))
    .limit(6);

  for (const order of demoShopOrders) {
    const values = {
      reference: order.reference,
      itemCount: formatNumber(1, 'fa'),
      total: formatCurrency(order.total, 'fa'),
    };
    const rendered = renderTemplate('order.newForShop', 'fa', values);

    notificationValues.push({
      eventKey: 'order.newForShop',
      recipientUserId: demoOwnerId,
      recipientRole: 'shopkeeper' as const,
      channel: 'sms' as const,
      locale: 'fa',
      title: rendered.title,
      body: rendered.body,
      payload: { ...values, orderId: order.id },
      // The two most recent stay unread, so the bell opens with a count on it.
      read: order !== demoShopOrders[0] && order !== demoShopOrders[1],
      createdAt: new Date(
        Math.min(order.createdAt.getTime() + 2 * 60 * 1000, NOW.getTime() - 3 * 60 * 1000),
      ),
    });
  }

  // The two seeded review reports, built back where the reviews were flagged.
  notificationValues.push(...flaggedReports);

  await db.insert(notifications).values(notificationValues);

  // ---------------------------------------------------------- stalled order
  /*
   * Age the OLDEST still-placed order past the admin's 48-hour staleness line
   * (PRD §7.2), so the admin action centre demonstrates all four of its row
   * types rather than three plus a branch that never fires.
   *
   * A post-update, not a change to how orders are dated: every `placed` order
   * lands inside the last day by construction, and reaching back into that
   * generator to make one of them older would move a draw and renumber every
   * order reference in the runbook. This touches one timestamp on one row that
   * is already chosen deterministically — the oldest — and drags its `placed`
   * event along with it so the timeline stays honest.
   */
  const STALE_DAYS = 3;
  const [stalest] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.status, 'placed'))
    .orderBy(orders.createdAt)
    .limit(1);

  if (stalest) {
    const stalledAt = new Date(NOW.getTime() - STALE_DAYS * DAY_MS);
    await db.update(orders).set({ createdAt: stalledAt }).where(eq(orders.id, stalest.id));
    await db
      .update(orderEvents)
      .set({ createdAt: stalledAt })
      .where(eq(orderEvents.orderId, stalest.id));
  }

  // --------------------------------------------------------- product views
  /*
   * Daily view counts, spread across the last 35 days so the dashboard's
   * "views this week" KPI has a real week-over-week comparison (PRD §6.1).
   *
   * Drawn from a SEPARATE generator, and that is the whole reason this block
   * sits at the very end of main(). Every order reference in the demo runbook
   * and in the check scripts — GC-24788, GC-24338 — is a function of the
   * position of a draw in the main `rand()` sequence, so taking even one extra
   * number from it renumbers the entire order book. A second mulberry32 with
   * its own seed is just as deterministic and touches nothing.
   *
   * Each product's rows sum to EXACTLY its seeded view_count, so the lifetime
   * counter on the product row and the sum of this table can never disagree —
   * they are two views of one number, not two numbers.
   */
  const viewRand = makeRandom(20260728);
  const VIEW_DAYS = 35;

  const viewDayValues: Array<{ productId: string; day: string; views: number }> = [];

  for (const product of productSeed) {
    const productId = productIds.get(product.slug);
    if (!productId) continue;

    /*
     * A rising weight curve, so the recent week outperforms the one before it
     * on most products but not all — a dashboard where every shop's arrow
     * points up reads as a mock-up, not as data.
     */
    const trend = 0.7 + viewRand() * 0.9;
    const weights = Array.from({ length: VIEW_DAYS }, (_, index) => {
      const ramp = 1 + (trend - 1) * (index / (VIEW_DAYS - 1));
      // Weekends are busier in Kabul retail; day 0 of this window is arbitrary
      // but stable, which is all the shape needs to be.
      const weekend = index % 7 === 4 || index % 7 === 5 ? 1.35 : 1;
      return ramp * weekend * (0.55 + viewRand() * 0.9);
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let allocated = 0;

    for (let index = 0; index < VIEW_DAYS; index += 1) {
      // Last day takes the remainder, which is what makes the sum exact.
      const views =
        index === VIEW_DAYS - 1
          ? Math.max(0, product.viewCount - allocated)
          : Math.round((product.viewCount * weights[index]) / totalWeight);
      allocated += views;
      if (views === 0) continue;

      const day = new Date(NOW);
      day.setUTCDate(day.getUTCDate() - (VIEW_DAYS - 1 - index));
      viewDayValues.push({ productId, day: day.toISOString().slice(0, 10), views });
    }
  }

  for (let index = 0; index < viewDayValues.length; index += 500) {
    await db.insert(productViewDays).values(viewDayValues.slice(index, index + 500));
  }

  // ------------------------------------------------------------- questions Q&A
  /*
   * Product questions (Prompt P4), seeded LAST.
   *
   * Order matters for a reason that is not obvious: every order reference in
   * the demo comes out of the shared PRNG, and the runbook and the checks name
   * specific ones (GC-24788, GC-24338). Anything that draws from it must
   * therefore be appended, never inserted between existing draws (CLAUDE.md).
   *
   * Most are answered, because a section full of unanswered questions makes the
   * shops look absent. The two or three left PENDING all belong to the demo
   * shopkeeper's own shop, so the action queue has live work in it when the
   * presenter opens the dashboard.
   */
  const questionValues: Array<{
    productSlug: string;
    ask: string;
    answer: string | null;
    daysAgo: number;
  }> = [
    { productSlug: 'iphone-13-128', ask: 'گرانتی شامل باتری هم می‌شود یا فقط بورد؟', answer: 'گرانتی دکان شامل بورد و باتری هر دو است، به‌شرطی که ضربه یا آب‌خوردگی نداشته باشد.', daysAgo: 9 },
    { productSlug: 'iphone-13-128', ask: 'کارتن و لوازم اصلی همراهش است؟', answer: 'بله، کارتن اصل با کیبل و سنجاق سیم‌کارت. آداپتر برق طبق سیاست اپل داخل کارتن نیست.', daysAgo: 4 },
    { productSlug: 'samsung-galaxy-a54-128', ask: 'دو سیم‌کارت را هم‌زمان می‌گیرد؟', answer: 'بله، دو سیم‌کارت فعال هم‌زمان و جای کارت حافظه جدا دارد.', daysAgo: 12 },
    { productSlug: 'xiaomi-redmi-note-13', ask: 'شارژر ۳۳ واتی داخل کارتن است؟', answer: 'بله، شارژر ۳۳ واتی اصلی داخل کارتن می‌آید.', daysAgo: 6 },
    { productSlug: 'samsung-tab-a9', ask: 'برای درس آنلاین صنف نهم مناسب است؟', answer: 'بله، برای ویدیو کنفرانس و کتاب‌های PDF کاملاً کافی است. اگر برای رسامی می‌خواهید، قلم جدا لازم دارد.', daysAgo: 15 },
    { productSlug: 'lg-tv-43-smart', ask: 'پایه دیواری همراهش می‌آید؟', answer: 'پایه رومیزی همراه است؛ پایه دیواری را دکان با نصب رایگان می‌دهد.', daysAgo: 11 },
    { productSlug: 'midea-fridge-260l', ask: 'با استبلایزر کار کند یا مستقیم؟', answer: 'برای برق کابل استبلایزر توصیه می‌شود. خود یخچال محافظ ولتاژ ساده دارد اما استبلایزر عمر کمپرسور را بیشتر می‌کند.', daysAgo: 20 },
    { productSlug: 'solar-panel-150w', ask: 'برای روشن کردن یک تلویزیون و چند چراغ کافی است؟', answer: 'با یک باتری ۱۰۰ آمپر و انورتر ۵۰۰ واتی، بله. برای یخچال باید حداقل دو پنل بگیرید.', daysAgo: 8 },
    { productSlug: 'casio-edifice-steel', ask: 'بند را می‌شود کوتاه کرد؟', answer: 'بله، تنظیم بند در همین دکان رایگان انجام می‌شود.', daysAgo: 14 },
    { productSlug: 'seiko-automatic-5', ask: 'اگر چند روز نپوشم می‌ایستد؟', answer: 'بله، حدود ۴۰ ساعت ذخیره دارد. بعد از آن با چند بار تکان دادن یا کوک دستی دوباره کار می‌کند.', daysAgo: 22 },
    { productSlug: 'nike-air-running', ask: 'سایز ۴۳ موجود است؟', answer: 'بله، سایز ۴۳ در رنگ مشکی و خاکستری موجود است.', daysAgo: 5 },
    { productSlug: 'mens-leather-oxford', ask: 'چرم طبیعی است یا مصنوعی؟', answer: 'چرم طبیعی گاوی با دوخت گودیر. کف آن هم قابل تعویض است.', daysAgo: 17 },
    { productSlug: 'womens-embroidered-dress', ask: 'گلدوزی ماشینی است؟', answer: 'خیر، گلدوزی سینه و آستین کاملاً دستی است و برای هر پیراهن چند روز وقت می‌گیرد.', daysAgo: 10 },
    { productSlug: 'moulinex-blender', ask: 'کاسه شیشه‌ای است یا پلاستیکی؟', answer: 'کاسه شیشه‌ای است، به همین دلیل بوی زردچوبه و ادویه نمی‌گیرد.', daysAgo: 13 },
    { productSlug: 'gold-ring-21k-simple', ask: 'با فاکتور رسمی می‌دهید؟', answer: 'بله، با فاکتور رسمی و مهر عیار. سایز انگشتر هم رایگان تنظیم می‌شود.', daysAgo: 19 },
    // Left unanswered on the demo shopkeeper's own shop — this is the live work
    // the action queue shows when the presenter opens the dashboard.
    { productSlug: 'jbl-flip-speaker', ask: 'چند ساعت شارژ نگه می‌دارد و ضد آب است؟', answer: null, daysAgo: 2 },
    { productSlug: 'anker-powerbank-20000', ask: 'لپ‌تاپ را هم شارژ می‌کند یا فقط موبایل؟', answer: null, daysAgo: 1 },
    { productSlug: 'lg-tv-43-smart', ask: 'ریسیور جداگانه لازم دارد یا کانال‌ها را خودش می‌گیرد؟', answer: null, daysAgo: 1 },
  ];

  const shopOwnerByShopId = new Map(
    shopSeed.map((shop) => [shopIds.get(shop.slug)!, shopOwnerIds.get(shop.slug)!]),
  );

  let answeredQuestions = 0;
  for (const entry of questionValues) {
    const productId = productIds.get(entry.productSlug);
    const product = productBySlug.get(entry.productSlug);
    if (!productId || !product) continue;

    const shopId = shopIds.get(product.shopSlug)!;
    const asker = pick(customerRows);
    const askedAt = daysAgo(entry.daysAgo);

    const [question] = await db
      .insert(productQuestions)
      .values({
        productId,
        shopId,
        userId: asker.id,
        body: entry.ask,
        status: entry.answer ? 'answered' : 'pending',
        createdAt: askedAt,
      })
      .returning({ id: productQuestions.id });

    if (entry.answer) {
      answeredQuestions += 1;
      const answeredAt = new Date(
        Math.min(askedAt.getTime() + 36 * 60 * 60 * 1000, NOW.getTime() - 60 * 60 * 1000),
      );
      await db.insert(productAnswers).values({
        questionId: question.id,
        answeredBy: shopOwnerByShopId.get(shopId)!,
        body: entry.answer,
        createdAt: answeredAt,
      });
    }
  }

  // -------------------------------------------------------------- verification
  /*
   * Every badge state, so the admin queue and the storefront both have
   * something to show (Prompt C7).
   *
   * DOCUMENT FILES ARE WRITTEN, and they are deliberately NOT forgeries.
   *
   * The earlier seed wrote rows pointing at files that never existed, reasoning
   * that a fabricated "business licence" would be a fake identity document
   * sitting in a repository. The reasoning was right; the result was not. The
   * admin's verification screen rendered a raw "Not found" inside both document
   * frames while approve and reject stayed enabled — so the one screen whose
   * entire job is judging evidence asked for a decision with no evidence, and
   * the failure looked like a broken page rather than an honest gap.
   *
   * What gets written instead is an obvious PLACEHOLDER: a grey page that says
   * SAMPLE — NOT A REAL DOCUMENT across it in Latin, with bars where text would
   * be. It cannot be mistaken for a licence or a tazkira by anyone, including a
   * screenshot. It gives the queue something to render, and the storage path,
   * the authenticated route, the mime handling and the reviewer's flow all get
   * exercised for real. Files land under storage/ (gitignored, outside the
   * served tree), so nothing synthetic is committed.
   *
   * The demo beat is still the shopkeeper uploading a real file live.
   */

  /**
   * A visibly fake document page. PNG rather than PDF so it renders inline in
   * every browser without a viewer, and so sharp — already a dependency for the
   * catalogue — can draw it.
   */
  const placeholderDocument = async (label: string): Promise<Buffer> => {
    const width = 1000;
    const height = 1414; // A4 proportions.
    const bar = (y: number, w: number) =>
      `<rect x="90" y="${y}" width="${w}" height="16" rx="8" fill="#d7dbe3"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f4f6fa"/>
      <rect x="60" y="60" width="${width - 120}" height="${height - 120}" rx="18" fill="#ffffff" stroke="#c9d1de" stroke-width="3"/>
      <rect x="90" y="110" width="420" height="30" rx="8" fill="#aeb8c8"/>
      ${[210, 250, 290, 330, 370, 450, 490, 530, 570, 650, 690, 730]
        .map((y, index) => bar(y, index % 3 === 2 ? 500 : 760))
        .join('')}
      <text x="${width / 2}" y="900" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="54" font-weight="bold" fill="#b42323" opacity="0.85">SAMPLE</text>
      <text x="${width / 2}" y="960" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="30" fill="#8b98ab">NOT A REAL DOCUMENT</text>
      <text x="${width / 2}" y="1010" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="26" fill="#8b98ab">${label}</text>
      ${[1090, 1130, 1170].map((y) => bar(y, 620)).join('')}
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  };
  const verificationPlan: Array<{
    shopSlug: string;
    status: 'verified' | 'submitted' | 'rejected';
    reason?: string;
    daysAgo: number;
  }> = shopSeed
    .filter((shop) => shop.status !== 'pending')
    .map((shop, index) => {
      if (index === 1) return { shopSlug: shop.slug, status: 'submitted' as const, daysAgo: 2 };
      if (index === 2)
        return {
          shopSlug: shop.slug,
          status: 'rejected' as const,
          reason: 'جواز کسب خوانا نیست — لطفاً عکس واضح‌تر با نور کافی بفرستید.',
          daysAgo: 9,
        };
      // Every third shop stays unverified, which is the normal state and the
      // one the badge's absence has to look right for.
      if (index % 3 === 0) return null;
      return { shopSlug: shop.slug, status: 'verified' as const, daysAgo: 30 + index };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  let verifiedShops = 0;
  for (const entry of verificationPlan) {
    const shopId = shopIds.get(entry.shopSlug);
    if (!shopId) continue;

    const submittedAt = daysAgo(entry.daysAgo);
    const decidedAt = entry.status === 'submitted' ? null : daysAgo(Math.max(1, entry.daysAgo - 2));

    const [record] = await db
      .insert(shopVerifications)
      .values({
        shopId,
        status: entry.status,
        submittedAt,
        decidedAt,
        decidedBy: entry.status === 'submitted' ? null : admin.id,
        reason: entry.reason ?? null,
        expiresAt:
          entry.status === 'verified' ? new Date(decidedAt!.getTime() + 365 * 86_400_000) : null,
        createdAt: submittedAt,
      })
      .returning({ id: shopVerifications.id });

    for (const kind of ['business_licence', 'owner_id'] as const) {
      // Written through the real storage helper, so the path shape, the
      // per-shop directory and the traversal guard are the ones production uses.
      const bytes = await placeholderDocument(
        kind === 'business_licence' ? 'business licence' : 'owner ID',
      );
      const filePath = await storeVerificationDocument(shopId, bytes, 'image/png');

      await db.insert(shopVerificationDocuments).values({
        verificationId: record.id,
        kind,
        filePath,
        mime: 'image/png',
        size: bytes.byteLength,
        originalName: `${kind}.png`,
        uploadedAt: submittedAt,
      });
    }

    if (entry.status === 'verified') {
      verifiedShops += 1;
      await db.update(shops).set({ verifiedAt: decidedAt }).where(eq(shops.id, shopId));
    }
  }

  // ----------------------------------------------------- reserve & collect
  /*
   * Collection codes and hold windows on the seeded pickup orders (Prompt C11).
   *
   * Written AFTER the order loop rather than inside it so no random draw moves:
   * every order reference the runbook and the check scripts name comes out of
   * that loop, and inserting one `pick()` there renumbers all of them
   * (CLAUDE.md). The codes are drawn from the same PRNG, so a reset reproduces
   * them exactly and the runbook can print one.
   *
   * Two states, both needed on screen: holds still inside their window — the
   * customer's code panel and the shopkeeper's counter — and ONE already
   * expired, which is the only way the release-the-stock moment is
   * demonstrable without waiting two days.
   */
  const readyPickups = await db
    .select({ id: orders.id, reference: orders.reference })
    .from(orders)
    .where(and(eq(orders.status, 'ready'), eq(orders.fulfillment, 'pickup')))
    .orderBy(orders.reference);

  /*
   * THE DEMO'S OWN HOLD, staged rather than hoped for.
   *
   * The random draw put every ready pickup order on shops and customers the
   * walkthrough never opens, so the code panel and the counter were both real
   * and both invisible. This is one order, from the demo CUSTOMER at the demo
   * SHOP, sitting ready with a live code — so the presenter can show the same
   * hold from both sides in one breath.
   *
   * Its reference is outside the range the loop draws from, so nothing the
   * runbook names moves (CLAUDE.md).
   */
  const demoCustomer = customerRows.find((row) => row.phone === '0700000003')!;
  const demoShopSlug = shopSeed[0].slug;
  const demoLines = sellable.filter((product) => product.shopSlug === demoShopSlug).slice(0, 2);
  const demoSubtotal = demoLines.reduce(
    (sum, product) => sum + (product.discountPrice ?? product.price),
    0,
  );
  const demoPlacedAt = new Date(NOW.getTime() - 20 * 60 * 60 * 1000);

  const [demoHold] = await db
    .insert(orders)
    .values({
      reference: 'GC-25142',
      userId: demoCustomer.id,
      status: 'ready',
      fulfillment: 'pickup',
      paymentMethod: 'cod',
      addressId: null,
      subtotal: demoSubtotal,
      discountTotal: 0,
      deliveryFee: 0,
      total: demoSubtotal,
      collectionCode: generateCollectionCode(rand),
      holdExpiresAt: new Date(NOW.getTime() + 28 * 60 * 60 * 1000),
      createdAt: demoPlacedAt,
    })
    .returning();

  await db.insert(orderItems).values(
    demoLines.map((product) => ({
      orderId: demoHold.id,
      shopId: shopIds.get(demoShopSlug)!,
      productId: productIds.get(product.slug)!,
      titleSnapshot: product.title,
      priceSnapshot: product.discountPrice ?? product.price,
      quantity: 1,
    })),
  );

  await db.insert(orderEvents).values([
    { orderId: demoHold.id, fromStatus: null, toStatus: 'placed' as const, actorUserId: demoCustomer.id, createdAt: demoPlacedAt },
    { orderId: demoHold.id, fromStatus: 'placed' as const, toStatus: 'accepted' as const, createdAt: new Date(demoPlacedAt.getTime() + 40 * 60 * 1000) },
    { orderId: demoHold.id, fromStatus: 'accepted' as const, toStatus: 'ready' as const, createdAt: new Date(demoPlacedAt.getTime() + 5 * 60 * 60 * 1000) },
  ]);

  /*
   * And one EXPIRED hold at the same shop, so the release-the-stock moment is
   * demonstrable without waiting two days for a window to lapse.
   */
  const [demoExpired] = await db
    .select({ id: orders.id, reference: orders.reference })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'ready'),
        sql`exists (
          select 1 from order_items oi join shops s on s.id = oi.shop_id
          where oi.order_id = orders.id and s.slug = ${demoShopSlug}
        )`,
        ne(orders.id, demoHold.id),
      ),
    )
    .limit(1);

  if (demoExpired) {
    await db
      .update(orders)
      .set({
        fulfillment: 'pickup',
        // A pickup order has no delivery address and no fee.
        addressId: null,
        deliveryFee: 0,
        collectionCode: generateCollectionCode(rand),
        holdExpiresAt: new Date(NOW.getTime() - 7 * 60 * 60 * 1000),
      })
      .where(eq(orders.id, demoExpired.id));
  }

  let holdsIssued = demoExpired ? 2 : 1;
  const expiredHold: string | null = demoExpired?.reference ?? null;

  for (const [index, order] of readyPickups.entries()) {
    // The randomly-drawn ones are all LIVE: the expired case is staged above on
    // the demo shop, where somebody will actually look at it.
    await db
      .update(orders)
      .set({
        collectionCode: generateCollectionCode(rand),
        holdExpiresAt: new Date(NOW.getTime() + (12 + index * 6) * 60 * 60 * 1000),
      })
      .where(eq(orders.id, order.id));

    holdsIssued += 1;
  }

  /*
   * THE TWO ENDINGS THE DEMO CUSTOMER NEVER HAD: one rejected, one cancelled.
   *
   * Their order history was ten fulfilled, one placed and one ready — so the
   * «رد شده» filter opened empty, and neither the rejection reason rendering
   * nor the cancelled voice could be reached by walking the app. Both states
   * carry translated, customer-facing consequences that were shipping unseen.
   *
   * Written HERE, after every draw that matters, and with explicit references:
   * no rand() is consumed, so the references the runbook names cannot move
   * (CLAUDE.md).
   */
  const closedOrderPlans = [
    {
      reference: 'GC-25301',
      status: 'rejected' as const,
      // The shop refusing at the door, in the enumerated form the customer's
      // message is written from.
      note: 'reason:out_of_stock',
      hoursAgo: 52,
    },
    {
      reference: 'GC-25302',
      status: 'cancelled' as const,
      // The customer changing their mind before the shop committed. The code
      // must be one `isOrderRejectReason` recognises, or the tracking page
      // renders the raw note instead of a translated sentence.
      note: 'reason:customer_cancelled',
      hoursAgo: 30,
    },
  ];

  for (const plan of closedOrderPlans) {
    const placedAt = new Date(NOW.getTime() - plan.hoursAgo * 60 * 60 * 1000);
    const line = demoLines[0];
    const price = line.discountPrice ?? line.price;

    const [closed] = await db
      .insert(orders)
      .values({
        reference: plan.reference,
        userId: demoCustomer.id,
        status: plan.status,
        fulfillment: 'delivery',
        paymentMethod: 'cod',
        addressId: null,
        addressSnapshot: {
          label: 'خانه',
          district: 'ناحیه چهارم',
          street: 'سرک دوم، کوچه سوم',
          phone: demoCustomer.phone,
        },
        subtotal: price,
        discountTotal: 0,
        deliveryFee: 0,
        total: price,
        createdAt: placedAt,
      })
      .returning({ id: orders.id });

    await db.insert(orderItems).values({
      orderId: closed.id,
      shopId: shopIds.get(demoShopSlug)!,
      productId: productIds.get(line.slug)!,
      titleSnapshot: line.title,
      priceSnapshot: price,
      quantity: 1,
    });

    /*
     * Stock is NOT decremented for these two. They ended without the goods
     * leaving, so the units are back on the shelf — which is exactly the state
     * the catalogue's stock numbers already describe (see the note on the
     * product stock column above).
     */
    await db.insert(orderEvents).values([
      {
        orderId: closed.id,
        fromStatus: null,
        toStatus: 'placed' as const,
        actorUserId: demoCustomer.id,
        createdAt: placedAt,
      },
      {
        orderId: closed.id,
        fromStatus: 'placed' as const,
        toStatus: plan.status,
        // The customer cancels their own order; the shop rejects.
        actorUserId: plan.status === 'cancelled' ? demoCustomer.id : null,
        note: plan.note,
        createdAt: new Date(placedAt.getTime() + 3 * 60 * 60 * 1000),
      },
    ]);
  }

  /*
   * THE BELL FOR THE ORDERS THAT DID NOT EXIST YET.
   *
   * GC-25142 (ready, with its collection code) and the two closed orders above
   * are created AFTER the notification block, so that block could not reach
   * them — the most demo-worthy message the product sends, the one that hands a
   * customer a code to read at a counter, was announced by nothing. Written
   * here, where the orders finally exist.
   */
  const lateNotifications: NotificationInsert[] = [];

  const [holdShopName] = await db
    .select({ name: shops.name })
    .from(shops)
    .where(eq(shops.slug, demoShopSlug))
    .limit(1);

  if (demoHold) {
    const readyValues = {
      reference: demoHold.reference,
      shopName: pickLocale(holdShopName!.name, 'fa'),
      fulfillment: 'pickup',
      collectionCode: demoHold.collectionCode ?? '',
      holdHours: formatNumber(DEFAULT_SETTINGS.pickupHoldHours ?? 24, 'fa'),
    };
    const rendered = renderTemplate('order.ready', 'fa', readyValues);
    lateNotifications.push({
      eventKey: 'order.ready',
      recipientUserId: demoCustomer.id,
      recipientRole: 'customer' as const,
      channel: 'sms' as const,
      locale: 'fa',
      title: rendered.title,
      body: rendered.body,
      payload: { ...readyValues, orderId: demoHold.id },
      // Unread: this is the one the bell should be drawing attention to.
      read: false,
      createdAt: new Date(demoPlacedAt.getTime() + 5 * 60 * 60 * 1000),
    });
  }

  for (const plan of closedOrderPlans) {
    const [row] = await db
      .select({ id: orders.id, total: orders.total })
      .from(orders)
      .where(eq(orders.reference, plan.reference))
      .limit(1);
    if (!row) continue;

    const code = plan.note.replace('reason:', '') as OrderRejectReason;
    const values = {
      reference: plan.reference,
      shopName: pickLocale(holdShopName!.name, 'fa'),
      // The customer reads the REASON, not the code it was filed under.
      reason: orderReasonText(code, 'fa'),
    };
    const key = plan.status === 'rejected' ? 'order.rejected' : 'order.cancelled';
    const rendered = renderTemplate(key, 'fa', values);

    lateNotifications.push({
      eventKey: key,
      recipientUserId: demoCustomer.id,
      recipientRole: 'customer' as const,
      channel: 'sms' as const,
      locale: 'fa',
      title: rendered.title,
      body: rendered.body,
      payload: { ...values, orderId: row.id },
      read: true,
      createdAt: new Date(NOW.getTime() - (plan.hoursAgo - 3) * 60 * 60 * 1000),
    });
  }

  if (lateNotifications.length > 0) {
    await db.insert(notifications).values(lateNotifications);
  }

  // ----------------------------------------------- shop reviews and follows
  /*
   * SEEDED LAST, deliberately (Prompt C8).
   *
   * Every draw from the PRNG shifts the ones after it, and the order references
   * the runbook and the check scripts name — GC-24788, GC-24338 — come out of
   * draws made much earlier. Appending this block at the very end means it
   * cannot renumber anything (CLAUDE.md).
   *
   * The entitlement is the real one: one review per FULFILLED order per SHOP,
   * written by the customer who placed it, which is the same rule
   * submitShopReview enforces at the action boundary.
   */
  const shopReviewCandidates = sample(
    fulfilledOrdersByShop,
    Math.min(70, fulfilledOrdersByShop.length),
  );
  let shopReviewCount = 0;

  for (const candidate of shopReviewCandidates) {

    // Service ratings skew a little harsher than product ratings: people
    // forgive a product they chose themselves sooner than a wasted trip.
    const roll = rand();
    const rating = roll < 0.4 ? 5 : roll < 0.72 ? 4 : roll < 0.88 ? 3 : roll < 0.97 ? 2 : 1;

    const english = chance(0.1) && SHOP_REVIEWS_EN[rating];
    const body = english ? pick(SHOP_REVIEWS_EN[rating]) : pick(SHOP_REVIEWS_FA[rating]);

    // Same clamp as the product reviews: never dated after fulfilment, never
    // dated in the future.
    const raw = candidate.fulfilledAt.getTime() + intBetween(1, 8) * DAY_MS;
    const createdAt = new Date(
      Math.min(
        Math.max(raw, candidate.fulfilledAt.getTime() + 3 * 60 * 60 * 1000),
        NOW.getTime() - 45 * 60 * 1000,
      ),
    );

    await db.insert(shopReviewRows).values({
      shopId: shopIds.get(candidate.shopSlug)!,
      userId: candidate.userId,
      orderId: candidate.orderId,
      rating,
      body,
      createdAt,
    });
    shopReviewCount += 1;
  }

  // Follows. Every customer follows a few shops, so the account hub and C12's
  // fan-out both have something real to read.
  const followPairs = new Set<string>();
  const followValues: Array<{ userId: string; shopId: string; createdAt: Date }> = [];
  for (const customer of customerRows) {
    for (const shop of sample(shopSeed.filter((entry) => entry.status !== 'pending'), intBetween(0, 4))) {
      const key = `${customer.id}:${shop.slug}`;
      if (followPairs.has(key)) continue;
      followPairs.add(key);
      followValues.push({
        userId: customer.id,
        shopId: shopIds.get(shop.slug)!,
        createdAt: daysAgo(intBetween(1, 90)),
      });
    }
  }
  if (followValues.length > 0) await db.insert(shopFollows).values(followValues);

  // --------------------------------------------------------------- audit log
  /*
   * The admin's decision history (Prompt C9).
   *
   * DERIVED FROM WHAT THIS SEED ACTUALLY DID, not invented alongside it. Every
   * row below points at a shop or a campaign that exists, with the timestamp
   * the decision carries in its own table — so an admin can open the audit page,
   * click through to the shop, and find exactly the state the entry describes.
   * A log of fictional decisions would be the one screen in the console that
   * cannot survive being checked.
   *
   * Written directly rather than through recordAdminAction() because the seed
   * is reconstructing history: the helper stamps `now`, and every entry here
   * belongs to the day the thing it records happened.
   */
  const auditRows: Array<typeof adminAuditLog.$inferInsert> = [];
  const actor = { actorId: admin.id, actorName: admin.name ?? 'مدیریت گلبهار' };

  for (const [index, shop] of shopSeed.entries()) {
    if (shop.status === 'pending') continue;
    const shopId = shopIds.get(shop.slug);
    if (!shopId) continue;

    auditRows.push({
      ...actor,
      action: 'shop.approve',
      targetType: 'shop',
      targetId: shopId,
      targetLabel: shop.name.fa,
      // A day after the application landed, which is the seeded created_at.
      createdAt: daysAgo(Math.max(1, 120 - index * 3 - 1)),
    });
  }

  for (const entry of verificationPlan) {
    const shopId = shopIds.get(entry.shopSlug);
    if (!shopId || entry.status === 'submitted') continue;

    const decidedAt = daysAgo(Math.max(1, entry.daysAgo - 2));
    auditRows.push({
      ...actor,
      action: entry.status === 'verified' ? 'verification.verify' : 'verification.reject',
      targetType: 'shop',
      targetId: shopId,
      targetLabel: shopSeed.find((shop) => shop.slug === entry.shopSlug)?.name.fa ?? null,
      reason: entry.reason ?? null,
      createdAt: decidedAt,
    });
  }

  const decidedCampaigns = await db
    .select({
      id: campaigns.id,
      createdAt: campaigns.createdAt,
      // The shop and the slot, so the entry says WHAT was approved. A row
      // reading only "approved a placement" is a timestamp with no subject —
      // and the label is snapshotted here for the same reason the column
      // exists (lib/db/schema/audit.ts).
      shopName: shops.name,
      slotName: promotionSlots.name,
      pricePaid: campaigns.pricePaid,
    })
    .from(campaigns)
    .innerJoin(shops, eq(campaigns.shopId, shops.id))
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .where(inArray(campaigns.status, ['approved', 'active', 'ended']));

  for (const campaign of decidedCampaigns.slice(0, 12)) {
    auditRows.push({
      ...actor,
      action: 'campaign.approve',
      targetType: 'campaign',
      targetId: campaign.id,
      targetLabel: `${campaign.shopName.fa} · ${campaign.slotName.fa}`,
      detail: { pricePaid: campaign.pricePaid },
      createdAt: campaign.createdAt,
    });
  }

  await db.insert(adminAuditLog).values(auditRows);

  // --------------------------------------------------------- search history
  /*
   * What the mall has been searching for (the header's trending chips).
   *
   * TERMS DRAWN FROM THE CATALOGUE, not invented: every one is a category name
   * or a word out of a real product title, so every chip returns results when
   * it is clicked. A trending list whose chips lead to "nothing found" is worse
   * than no trending list — it is the one control on the page that promises the
   * catalogue is bigger than it is.
   *
   * The distribution is deliberately long-tailed. Uniform counts would put the
   * `having count(*) >= 2` floor either under everything or over everything,
   * and the ordering the chips are picked by would be meaningless.
   */
  const searchSeeds: Array<{ fa: string; en: string; weight: number }> = [
    { fa: 'موبایل', en: 'mobile', weight: 34 },
    { fa: 'آیفون', en: 'iphone', weight: 28 },
    { fa: 'کفش', en: 'shoes', weight: 25 },
    { fa: 'تلویزیون', en: 'tv', weight: 21 },
    { fa: 'عطر', en: 'perfume', weight: 19 },
    { fa: 'سامسونگ', en: 'samsung', weight: 17 },
    { fa: 'ساعت', en: 'watch', weight: 15 },
    { fa: 'هدفون', en: 'headphones', weight: 13 },
    { fa: 'لباس زنانه', en: 'dress', weight: 12 },
    { fa: 'یخچال', en: 'fridge', weight: 10 },
    { fa: 'طلا', en: 'gold', weight: 9 },
    { fa: 'بکس مکتب', en: 'school bag', weight: 8 },
    { fa: 'پاور بانک', en: 'power bank', weight: 7 },
    { fa: 'اسباب‌بازی', en: 'toys', weight: 6 },
    { fa: 'قرطاسیه', en: 'stationery', weight: 5 },
    { fa: 'خشکبار', en: 'dried fruit', weight: 4 },
    { fa: 'کریم', en: 'cream', weight: 3 },
    { fa: 'توپ کرکت', en: 'cricket ball', weight: 2 },
  ];

  const searchRows: Array<typeof searchQueries.$inferInsert> = [];
  for (const entry of searchSeeds) {
    for (const [locale, term] of [
      ['fa', entry.fa],
      ['en', entry.en],
    ] as const) {
      // English is the minority language here, so it carries a third of the
      // volume — enough to clear the floor, not enough to look invented.
      const count = locale === 'fa' ? entry.weight : Math.max(2, Math.round(entry.weight / 3));
      for (let index = 0; index < count; index += 1) {
        searchRows.push({
          term,
          normalized: term.trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
          locale,
          createdAt: daysAgo(intBetween(0, 27), 8, 21),
        });
      }
    }
  }
  await db.insert(searchQueries).values(searchRows);

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
  console.log(
    `  questions           ${questionValues.length} (${answeredQuestions} answered, ${questionValues.length - answeredQuestions} waiting)`,
  );
  console.log(
    `  verifications       ${verificationPlan.length} (${verifiedShops} verified, 1 waiting, 1 rejected)`,
  );
  console.log(`  shop reviews        ${shopReviewCount} (one per fulfilled order per shop)`);
  console.log(
    `  collection holds    ${holdsIssued}${expiredHold ? ` (${expiredHold} already expired)` : ''}`,
  );
  console.log(`  shop follows        ${followValues.length}`);
  console.log(
    `  search history      ${searchRows.length} queries across ${searchSeeds.length} terms`,
  );
  console.log(`  audit entries       ${auditRows.length} (derived from seeded decisions)`);

  console.log('\nDemo sign-in numbers (any 6-digit code from the notification log):');
  console.log('  admin        0700000001');
  console.log('  shopkeeper   0700000002  (owner of الکترونیک کابل)');
  console.log('  staff        0700000004  (same shop, staff role)');
  console.log('  customer     0700000003');

  console.log(`\n✓ seeded in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

/**
 * The editorial half of a product (Prompt P1), authored by
 * scripts/author-product-details.py.
 *
 * Rows carry only `key` and `value`; the LABEL is resolved here from the
 * category template in lib/product-templates.ts, so the spec vocabulary has one
 * definition rather than two files that drift. A row whose key is not in its
 * category's template must carry its own label — and if it does neither, the
 * seed THROWS rather than writing a spec table with a blank label column, which
 * would reach the product page as an empty cell nobody could explain.
 */
type ProductDetail = {
  brand: string | null;
  model: string | null;
  description: LocalizedText;
  attributes: Array<{ key: string; label?: LocalizedText; value: LocalizedText }>;
  features: ProductFeature[];
};

function productDetail(product: ProductSeed, detail: ProductDetail | undefined) {
  if (!detail) {
    throw new Error(
      `content/seed/product-details.json has no entry for "${product.slug}". ` +
        'Run python3 scripts/author-product-details.py.',
    );
  }

  const template = specTemplateFor(product.categorySlug);

  const attributes: ProductAttribute[] = detail.attributes.map((row) => {
    const label = row.label ?? template.find((entry) => entry.key === row.key)?.label;
    if (!label) {
      throw new Error(
        `spec "${row.key}" on ${product.slug} is not in the ${product.categorySlug} ` +
          'template and carries no label of its own',
      );
    }
    const group = template.find((entry) => entry.key === row.key)?.group;
    return group ? { key: row.key, label, value: row.value, group } : { key: row.key, label, value: row.value };
  });

  return {
    // The long description REPLACES the one-liner in products.json: the product
    // page had nothing to say, which is the whole reason for this prompt.
    description: detail.description,
    brand: detail.brand,
    model: detail.model,
    attributes,
    features: detail.features,
  };
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
