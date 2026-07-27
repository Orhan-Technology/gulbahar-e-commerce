import { cookies } from 'next/headers';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from './db';
import { cartItems, products, shops } from './db/schema';
import { discountFraction } from './format';
import { activeOffersForShops, bestOfferFor, type AppliedOffer } from './offers';
import { currentUser } from './auth/guards';

/**
 * Multi-shop cart (PRD §5.3).
 *
 * Two storage backends behind one interface: a cookie for guests so browsing and
 * adding to cart never require an account, and cart_items rows once signed in.
 * `mergeGuestCart` folds the cookie into the database at sign-in, which is what
 * makes the checkout OTP step feel like a step rather than a reset (PRD §5.7).
 */

const COOKIE_NAME = 'gulbahar_cart';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type CartLine = {
  productId: string;
  quantity: number;
  variantSelection?: string[] | null;
};

export type CartLineDetail = CartLine & {
  slug: string;
  title: (typeof products.$inferSelect)['title'];
  price: number;
  discountPrice: number | null;
  /** Effective unit price after any product-level discount. */
  unitPrice: number;
  stock: number;
  imagePath: string | null;
  shopId: string;
  shopSlug: string;
  shopName: (typeof shops.$inferSelect)['name'];
  shopFloor: number | null;
  shopUnitNumber: string | null;
  lineTotal: number;
};

export type CartGroup = {
  shopId: string;
  shopSlug: string;
  shopName: (typeof shops.$inferSelect)['name'];
  shopFloor: number | null;
  shopUnitNumber: string | null;
  lines: CartLineDetail[];
  /** Sum of line totals, after product-level discounts but before any offer. */
  subtotal: number;
  /** The single best applicable shop offer, or null (PRD §8.1). */
  offer: AppliedOffer | null;
  /** subtotal minus the offer deduction — what this shop actually charges. */
  total: number;
};

/* --------------------------------------------------------------------------
 * Cookie backend (guests)
 * ------------------------------------------------------------------------ */

async function readCookieCart(): Promise<CartLine[]> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive: a hand-edited cookie must not crash a page render.
    return parsed
      .filter(
        (entry): entry is CartLine =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as CartLine).productId === 'string' &&
          Number.isFinite((entry as CartLine).quantity),
      )
      .map((entry) => ({
        productId: entry.productId,
        quantity: Math.max(1, Math.min(99, Math.floor(entry.quantity))),
        variantSelection: Array.isArray(entry.variantSelection) ? entry.variantSelection : null,
      }));
  } catch {
    return [];
  }
}

async function writeCookieCart(lines: CartLine[]): Promise<void> {
  const store = await cookies();
  if (lines.length === 0) {
    store.delete(COOKIE_NAME);
    return;
  }
  store.set(COOKIE_NAME, JSON.stringify(lines), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

/* --------------------------------------------------------------------------
 * Unified reads and writes
 * ------------------------------------------------------------------------ */

/** Raw cart lines for the active viewer, from whichever backend applies. */
export async function getCartLines(): Promise<CartLine[]> {
  const user = await currentUser();
  if (!user?.id) return readCookieCart();

  const rows = await db
    .select({
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      variantSelection: cartItems.variantSelection,
    })
    .from(cartItems)
    .where(eq(cartItems.userId, user.id));

  return rows;
}

/** Total item count, for the header badge. */
export async function getCartCount(): Promise<number> {
  const lines = await getCartLines();
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export async function addToCart(
  productId: string,
  quantity = 1,
  variantSelection: string[] | null = null,
): Promise<void> {
  const user = await currentUser();
  const safeQuantity = Math.max(1, Math.min(99, Math.floor(quantity)));

  if (user?.id) {
    await db
      .insert(cartItems)
      .values({ userId: user.id, productId, quantity: safeQuantity, variantSelection })
      .onConflictDoUpdate({
        target: [cartItems.userId, cartItems.productId],
        set: {
          quantity: sql`least(${cartItems.quantity} + ${safeQuantity}, 99)`,
          variantSelection,
          updatedAt: new Date(),
        },
      });
    return;
  }

  const lines = await readCookieCart();
  const existing = lines.find((line) => line.productId === productId);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + safeQuantity);
    existing.variantSelection = variantSelection;
  } else {
    lines.push({ productId, quantity: safeQuantity, variantSelection });
  }
  await writeCookieCart(lines);
}

export async function setCartQuantity(productId: string, quantity: number): Promise<void> {
  const user = await currentUser();
  const safeQuantity = Math.floor(quantity);

  if (safeQuantity <= 0) {
    await removeFromCart(productId);
    return;
  }

  const clamped = Math.min(99, safeQuantity);

  if (user?.id) {
    await db
      .update(cartItems)
      .set({ quantity: clamped, updatedAt: new Date() })
      .where(and(eq(cartItems.userId, user.id), eq(cartItems.productId, productId)));
    return;
  }

  const lines = await readCookieCart();
  const existing = lines.find((line) => line.productId === productId);
  if (existing) existing.quantity = clamped;
  await writeCookieCart(lines);
}

export async function removeFromCart(productId: string): Promise<void> {
  const user = await currentUser();

  if (user?.id) {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.userId, user.id), eq(cartItems.productId, productId)));
    return;
  }

  const lines = await readCookieCart();
  await writeCookieCart(lines.filter((line) => line.productId !== productId));
}

export async function clearCart(): Promise<void> {
  const user = await currentUser();
  if (user?.id) {
    await db.delete(cartItems).where(eq(cartItems.userId, user.id));
  }
  await writeCookieCart([]);
}

/**
 * Folds a guest's cookie cart into their account at sign-in and clears the
 * cookie, so nothing is lost when checkout asks them to verify a phone number.
 */
export async function mergeGuestCart(userId: string): Promise<number> {
  const guestLines = await readCookieCart();
  if (guestLines.length === 0) return 0;

  for (const line of guestLines) {
    await db
      .insert(cartItems)
      .values({
        userId,
        productId: line.productId,
        quantity: line.quantity,
        variantSelection: line.variantSelection ?? null,
      })
      .onConflictDoUpdate({
        target: [cartItems.userId, cartItems.productId],
        // Take the larger quantity rather than summing: the customer sees one
        // basket, and doubling on merge would look like a bug.
        set: { quantity: sql`greatest(${cartItems.quantity}, ${line.quantity})` },
      });
  }

  await writeCookieCart([]);
  return guestLines.length;
}

/**
 * Hydrated cart grouped by shop (PRD §5.3), with per-shop and grand totals.
 *
 * Lines whose product has been unpublished or deleted are dropped rather than
 * rendered as a broken row.
 */
export async function getCart(): Promise<{
  groups: CartGroup[];
  itemCount: number;
  /** Sum of line totals after product-level discounts, before offers. */
  subtotal: number;
  /** Savings from product-level discount prices. */
  productSavings: number;
  /** Savings from shop offers, summed across groups. */
  offerSavings: number;
  /** What the customer pays before any delivery fee. */
  total: number;
}> {
  const lines = await getCartLines();
  if (lines.length === 0) {
    return { groups: [], itemCount: 0, subtotal: 0, productSavings: 0, offerSavings: 0, total: 0 };
  }

  const rows = await db
    .select({
      productId: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      imagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = products.id
        order by pi.sort asc limit 1
      )`,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      shopUnitNumber: shops.unitNumber,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        inArray(
          products.id,
          lines.map((line) => line.productId),
        ),
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
      ),
    );

  const byId = new Map(rows.map((row) => [row.productId, row]));
  const groups = new Map<string, CartGroup>();
  let subtotal = 0;
  let productSavings = 0;
  let itemCount = 0;

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;

    const unitPrice = product.discountPrice ?? product.price;
    const lineTotal = unitPrice * line.quantity;
    const saved = discountFraction(product.price, product.discountPrice)
      ? (product.price - unitPrice) * line.quantity
      : 0;

    subtotal += lineTotal;
    productSavings += saved;
    itemCount += line.quantity;

    const detail: CartLineDetail = {
      ...line,
      slug: product.slug,
      title: product.title,
      price: product.price,
      discountPrice: product.discountPrice,
      unitPrice,
      stock: product.stock,
      imagePath: product.imagePath,
      shopId: product.shopId,
      shopSlug: product.shopSlug,
      shopName: product.shopName,
      shopFloor: product.shopFloor,
      shopUnitNumber: product.shopUnitNumber,
      lineTotal,
    };

    const group = groups.get(product.shopId);
    if (group) {
      group.lines.push(detail);
      group.subtotal += lineTotal;
    } else {
      groups.set(product.shopId, {
        shopId: product.shopId,
        shopSlug: product.shopSlug,
        shopName: product.shopName,
        shopFloor: product.shopFloor,
        shopUnitNumber: product.shopUnitNumber,
        lines: [detail],
        subtotal: lineTotal,
        offer: null,
        total: lineTotal,
      });
    }
  }

  /*
   * Offers are resolved after grouping, because an offer applies to a shop's
   * basket as a whole (shop-wide or across a set of its products) rather than to
   * a single line — see lib/offers.ts for the arithmetic and why only the single
   * best offer per shop applies.
   */
  const shopOffers = await activeOffersForShops([...groups.keys()]);
  let offerSavings = 0;

  for (const group of groups.values()) {
    const applicable = shopOffers.filter((offer) => offer.shopId === group.shopId);
    group.offer = bestOfferFor(
      group.lines.map((line) => ({ productId: line.productId, lineTotal: line.lineTotal })),
      applicable,
    );
    group.total = group.subtotal - (group.offer?.amount ?? 0);
    offerSavings += group.offer?.amount ?? 0;
  }

  return {
    groups: [...groups.values()],
    itemCount,
    subtotal,
    productSavings,
    offerSavings,
    total: subtotal - offerSavings,
  };
}
