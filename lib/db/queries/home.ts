import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '..';
import {
  campaigns,
  categories,
  offers,
  products,
  promotionSlots,
  shops,
  wishlistItems,
} from '../schema';
import {
  firstProductImagePath,
  productRatingAvg,
  productReviewCount,
  shopPublishedProductCount,
  shopRatingAvg,
  shopReviewCount,
} from './fragments';

/**
 * Queries specific to the storefront home page (PRD §5.1).
 *
 * Every promoted section returns its campaign id alongside the content so the
 * page can record an impression and render the Sponsored badge (PRD §8.4).
 */

/**
 * The single home_hero placement. Returns whichever of product or shop the
 * campaign points at, so the page can render either without a second query.
 *
 * Null when the slot is unsold — the page then falls back to a default banner
 * rather than collapsing, because an empty hero is the worst thing the client
 * could see on the first screen (PRD §5.1).
 */
/** Re-exported so the assembly above has one import for its last module. */
async function newArrivalsForHome(locale: string, limit: number) {
  const { newArrivals } = await import('./products');
  return newArrivals(locale, limit);
}

export async function homeHeroCampaign(now: Date = new Date()) {
  const [row] = await db
    .select({
      campaignId: campaigns.id,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopDescription: shops.description,
      shopBannerPath: shops.bannerPath,
      shopLogoPath: shops.logoPath,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      productPrice: products.price,
      productDiscountPrice: products.discountPrice,
      productImagePath: sql<string | null>`(
        select pi.path from product_images pi
        where pi.product_id = campaigns.product_id
        order by pi.sort asc limit 1
      )`,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .innerJoin(shops, eq(campaigns.shopId, shops.id))
    .leftJoin(products, eq(campaigns.productId, products.id))
    .where(
      and(
        eq(promotionSlots.key, 'home_hero'),
        eq(campaigns.status, 'active'),
        lte(campaigns.startsAt, now),
        gte(campaigns.endsAt, now),
        eq(shops.status, 'approved'),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Featured shops carousel: promoted first, then organic top-rated to fill. */
export async function featuredShops(limit = 8, now: Date = new Date()) {
  const promoted = await db
    .select({
      campaignId: campaigns.id,
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      categoryName: categories.name,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      rating: shopRatingAvg,
      reviewCount: shopReviewCount,
      productCount: shopPublishedProductCount,
      capacity: promotionSlots.capacity,
    })
    .from(campaigns)
    .innerJoin(promotionSlots, eq(campaigns.slotId, promotionSlots.id))
    .innerJoin(shops, eq(campaigns.shopId, shops.id))
    .leftJoin(categories, eq(shops.categoryId, categories.id))
    .where(
      and(
        eq(promotionSlots.key, 'featured_shops'),
        eq(campaigns.status, 'active'),
        lte(campaigns.startsAt, now),
        gte(campaigns.endsAt, now),
        eq(shops.status, 'approved'),
      ),
    )
    .orderBy(campaigns.startsAt);

  // Capacity caps paid placement so organic results stay dominant (PRD §8.4).
  const capacity = promoted[0]?.capacity ?? 0;
  const sponsored = promoted
    .slice(0, capacity)
    .map((row) => ({ ...row, sponsored: true as const }));
  const sponsoredIds = sponsored.map((row) => row.id);

  const remaining = Math.max(0, limit - sponsored.length);
  const organic =
    remaining === 0
      ? []
      : await db
          .select({
            campaignId: sql<string | null>`null`,
            id: shops.id,
            slug: shops.slug,
            name: shops.name,
            categoryName: categories.name,
            floor: shops.floor,
            unitNumber: shops.unitNumber,
            logoPath: shops.logoPath,
            bannerPath: shops.bannerPath,
            rating: shopRatingAvg,
            reviewCount: shopReviewCount,
            productCount: shopPublishedProductCount,
          })
          .from(shops)
          .leftJoin(categories, eq(shops.categoryId, categories.id))
          .where(
            and(
              eq(shops.status, 'approved'),
              sponsoredIds.length > 0 ? sql`${shops.id} not in ${sponsoredIds}` : sql`true`,
            ),
          )
          .orderBy(desc(shopRatingAvg))
          .limit(remaining);

  return [...sponsored, ...organic.map((row) => ({ ...row, capacity, sponsored: false as const }))];
}

/**
 * Active offers for the home strip (PRD §5.1), with the shop they belong to and
 * a representative product image so each chip has something to show.
 */
export async function activeOffers(limit = 8, now: Date = new Date()) {
  const rows = await db
    .select({
      id: offers.id,
      name: offers.name,
      type: offers.type,
      value: offers.value,
      scope: offers.scope,
      productIds: offers.productIds,
      startsAt: offers.startsAt,
      endsAt: offers.endsAt,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      shopLogoPath: shops.logoPath,
      /*
       * A photo for the offer chip and the home page's promo card. Offers do not
       * own imagery — they are a discount rule, not a product — so this borrows
       * the shop's most-viewed product shot. Without it the promo card was a
       * headline over an empty panel.
       */
      imagePath: sql<string | null>`(
        select pi.path from products p
        join product_images pi on pi.product_id = p.id
        where p.shop_id = ${shops.id} and p.status = 'published'
        order by p.view_count desc, pi.sort asc
        limit 1
      )`,
      /*
       * HOW MUCH IS ACTUALLY IN THE SALE. An offer card read as a headline over
       * a shop name with no sense of scale, so «۲۵٪ تخفیف» could equally have
       * meant one clearance item or the whole floor. A shop-wide offer counts
       * the shop's published catalogue; a product-scoped one counts its own
       * list, intersected with what is still published so a deleted product
       * cannot inflate the number.
       */
      /*
       * WHAT IS ACTUALLY IN THE SALE, as pictures.
       *
       * The offer rows on /offers read as ledger entries — a discount, a shop
       * name and a countdown, three numbers and no goods — on the one page in
       * the store whose subject is buying something. An offer is not a coupon,
       * it is a window: these are the three most-viewed in-stock products it
       * covers, first image each, so the row shows what the discount is ON.
       *
       * IN-STOCK ONLY, for the same reason the offers grid hides sold-out
       * cards: every pixel of this band is the shop telling the reader to buy.
       *
       * One subquery rather than a second round trip per offer — a promotional
       * band that costs N+1 queries is a band that gets deleted the first time
       * anyone profiles the page. `distinct on (p.id)` picks each product's
       * first image, and the outer wrapper is what lets the LIMIT apply before
       * the aggregate.
       */
      previewImages: sql<string[]>`(
        select coalesce(jsonb_agg(y.path), '[]'::jsonb) from (
          select x.path from (
            select distinct on (p.id) p.id, p.view_count, pi.path
            from products p
            join product_images pi on pi.product_id = p.id
            where p.shop_id = offers.shop_id
              and p.status = 'published'
              and p.stock > 0
              and (
                offers.scope = 'shop'
                or p.id::text in (
                  select jsonb_array_elements_text(coalesce(offers.product_ids, '[]'::jsonb))
                )
              )
            order by p.id, pi.sort asc
          ) x
          order by x.view_count desc
          limit 3
        ) y
      )`,
      /*
       * Written as literal qualified SQL, not with interpolated columns: inside
       * a subquery aliased `p`, drizzle's unqualified rendering of
       * `${offers.scope}` would bind to the wrong relation (see
       * queries/fragments.ts for the same trap). `product_ids` is jsonb, so the
       * membership test goes through jsonb_array_elements_text rather than
       * `= any(...)`, which only works on a real array column.
       */
      productCount: sql<number>`(
        select count(*)::int from products p
        where p.shop_id = offers.shop_id
          and p.status = 'published'
          and (
            offers.scope = 'shop'
            or p.id::text in (
              select jsonb_array_elements_text(coalesce(offers.product_ids, '[]'::jsonb))
            )
          )
      )`,
    })
    .from(offers)
    .innerJoin(shops, eq(offers.shopId, shops.id))
    .where(
      and(
        eq(offers.active, true),
        lte(offers.startsAt, now),
        gte(offers.endsAt, now),
        eq(shops.status, 'approved'),
      ),
    )
    .orderBy(offers.endsAt)
    .limit(limit);

  return rows;
}

/**
 * NOTHING SOLD OUT IN A PROMOTIONAL SLOT.
 *
 * A rail, a spotlight and an offers grid are all the shop TELLING the reader to
 * buy something. An out-of-stock card there is an advert for a disappointment —
 * and it is worse with a discount ribbon on it, because the reader reads the
 * price before the badge. Ordinary category and search listings keep their
 * sold-out rows: there the reader asked what exists, and "this exists but is
 * gone" is a true and useful answer.
 */
const inStock = sql`${products.stock} > 0`;

/**
 * Products carrying an active discount — what the offers section actually links
 * to, so "Offers" is never a page of chips with nothing behind them.
 */
export async function discountedProducts(limit = 12) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        inStock,
        sql`${products.discountPrice} is not null and ${products.discountPrice} < ${products.price}`,
      ),
    )
    .orderBy(desc(sql`(${products.price} - ${products.discountPrice})::float8 / ${products.price}`))
    .limit(limit);

  return rows;
}

/**
 * Which of the given products the viewer has wishlisted, so hearts render in the
 * correct state on first paint instead of popping after hydration.
 *
 * Uses inArray rather than interpolating ids into raw SQL: these are internal
 * uuids today, but a parameterised query is the only version that stays safe if
 * a caller ever passes something user-supplied.
 */
export async function wishlistedProductIds(
  userId: string | null | undefined,
  productIds: string[],
): Promise<Set<string>> {
  if (!userId || productIds.length === 0) return new Set();

  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), inArray(wishlistItems.productId, productIds)));

  return new Set(rows.map((row) => row.productId));
}

/**
 * The viewer's wishlist with live price and stock (PRD §5.6).
 *
 * Price and stock are read fresh rather than snapshotted at save time — the point
 * of a wishlist is to watch for a change, so a stale price would defeat it.
 */
export async function wishlistForUser(userId: string) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      status: products.status,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
      savedAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  }));
}

/**
 * Bestsellers within one ROOT category, for the home page's per-category rails
 * (PRD §5.1).
 *
 * Matches the category itself or any of its children, because every product is
 * filed in a leaf — the same reason categoryProductCount counts self-or-child.
 * Ordered by view count with rating as the tiebreaker: "bestseller" on a demo
 * with no purchase history is really "most looked at", and rating alone put
 * five-star products with two reviews above genuinely popular ones.
 *
 * Returns [] for a category whose shops are all unapproved — the food category
 * is exactly that until the pending shop is approved on stage — so callers must
 * be ready to render nothing rather than an empty rail.
 */
export async function categoryBestsellers(rootSlug: string, limit = 5) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.status, 'published'),
        eq(shops.status, 'approved'),
        inStock,
        sql`(${categories.slug} = ${rootSlug} or ${categories.parentId} = (
          select id from ${categories} root where root.slug = ${rootSlug}
        ))`,
      ),
    )
    .orderBy(desc(products.viewCount), desc(productRatingAvg))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    reviewCount: Number(row.reviewCount),
  }));
}

/**
 * One shop and a handful of its products, for the home page's spotlight block.
 *
 * The mockup fills this band with four promo tiles for a single tenant. Those
 * are artwork a shop would have to supply and this build has none, so the block
 * is the shop's banner beside its own products instead — same shape, real
 * content. Picks the best-rated approved shop with enough stock to fill the row,
 * so the band is never half empty.
 *
 * MIN_REVIEWS is the whole trick: rating alone spotlighted the stationery shop
 * on the strength of one five-star review, over a shop rated 4.7 across
 * fourteen. A demo's shop of the week cannot be a sample-size artifact.
 */
const SPOTLIGHT_MIN_REVIEWS = 5;

export async function shopSpotlight(productLimit = 4) {
  const columns = {
    id: shops.id,
    slug: shops.slug,
    name: shops.name,
    description: shops.description,
    floor: shops.floor,
    bannerPath: shops.bannerPath,
    logoPath: shops.logoPath,
    rating: shopRatingAvg,
    reviewCount: shopReviewCount,
    productCount: shopPublishedProductCount,
  };

  const pick = (minReviews: number) =>
    db
      .select(columns)
      .from(shops)
      .where(
        and(
          eq(shops.status, 'approved'),
          gte(shopPublishedProductCount, productLimit),
          gte(shopReviewCount, minReviews),
        ),
      )
      .orderBy(desc(shopRatingAvg), desc(shopReviewCount))
      .limit(1);

  // Falls back to no threshold so a freshly reset database still fills the band.
  const reviewed = await pick(SPOTLIGHT_MIN_REVIEWS);
  const [shop] = reviewed.length > 0 ? reviewed : await pick(0);

  if (!shop) return null;

  const items = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
      stock: products.stock,
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      shopFloor: shops.floor,
      imagePath: firstProductImagePath,
      rating: productRatingAvg,
      reviewCount: productReviewCount,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.shopId, shop.id), eq(products.status, 'published'), inStock))
    .orderBy(desc(products.viewCount))
    .limit(productLimit);

  return {
    shop: {
      ...shop,
      rating: Number(shop.rating),
      reviewCount: Number(shop.reviewCount),
      productCount: Number(shop.productCount),
    },
    items: items.map((row) => ({
      ...row,
      rating: Number(row.rating),
      reviewCount: Number(row.reviewCount),
    })),
  };
}

/**
 * Every product-bearing home module, assembled IN ORDER with no repeats
 * (PRD §5.1).
 *
 * A product appearing three times down one page is the single loudest signal
 * that a catalogue is small — and with 75 products it happened constantly,
 * because "today's deals", "bestsellers in electronics" and "new arrivals" are
 * three questions with substantially the same answer.
 *
 * So the modules are filled top-to-bottom from one function rather than each
 * running its own query in its own Suspense boundary. That ordering is the
 * whole mechanism: a module gets what is left after the ones above it, which
 * makes the page feel like a catalogue rather than a slideshow of the same
 * fifteen items.
 *
 * The cost is that these bands stream as one unit instead of four. On a local
 * database that is a few milliseconds; the alternative is boundaries resolving
 * in an order nobody controls, which makes dedupe non-deterministic — and a
 * page that shows different repeats on every reload is worse than one that
 * repeats consistently.
 */
export async function homeProductModules(locale: string, railSlugs: readonly string[]) {
  const used = new Set<string>();

  /** Drops anything already placed higher up the page, then claims the rest. */
  const claim = <T extends { id: string }>(items: T[], limit: number): T[] => {
    const fresh = items.filter((item) => !used.has(item.id)).slice(0, limit);
    for (const item of fresh) used.add(item.id);
    return fresh;
  };

  // Over-fetch: each module asks for well over what it shows, so the ones lower
  // down still have something left after the ones above have taken their pick.
  const deals = claim(await discountedProducts(24), 12);

  const rails: Array<{ slug: string; items: Awaited<ReturnType<typeof categoryBestsellers>> }> = [];
  for (const slug of railSlugs) {
    rails.push({ slug, items: claim(await categoryBestsellers(slug, 24), 12) });
  }

  /*
   * The spotlight claims BEFORE new arrivals but is rendered after the rails.
   * Its four products belong to one named shop, so they cannot be swapped for
   * something else if the arrivals band takes them first — whereas arrivals can
   * always fall back to the next-newest thing. Claim order follows how
   * constrained a module is, not where it sits on the page.
   */
  const spotlight = await shopSpotlight(4);
  const spotlightItems = spotlight ? claim(spotlight.items, 4) : [];

  /*
   * `newArrivals` is the shared listing query and rightly keeps sold-out rows,
   * so the promotional rule is applied HERE rather than by widening a query two
   * other surfaces depend on. Eight, not fourteen: this band is a rail now, and
   * fourteen cards in a scroller is a catalogue nobody reaches the end of.
   */
  const arrivals = claim(
    (await newArrivalsForHome(locale, 32)).filter((item) => item.stock > 0),
    8,
  );

  return {
    deals,
    rails,
    spotlight: spotlight ? { ...spotlight, items: spotlightItems } : null,
    arrivals,
  };
}
