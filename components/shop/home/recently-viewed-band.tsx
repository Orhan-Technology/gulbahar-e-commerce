'use client';

import * as React from 'react';

import { ProductCard } from '@/components/custom/product-card';
import { QuickAddButton } from '@/components/shop/quick-add-button';
import { Rail } from '@/components/shop/rail';
import { WishlistButton } from '@/components/shop/wishlist-button';
import { recentlyViewedProducts, type RecentlyViewedCard } from '@/lib/actions/recently-viewed';

/** Written by the product page; this band only ever READS it. */
const STORAGE_KEY = 'gulbahar.recentlyViewed';
/** Twelve is two full rails; beyond that it is an archive, not a trail. */
const MAX_ENTRIES = 12;
/** Fewer than this and it is a stub, which reads as a broken rail. */
const MIN_TO_RENDER = 3;

/**
 * "Recently viewed", on the home page (Prompt P5).
 *
 * THE CHEAPEST REAL PERSONALISATION THERE IS, and until now it existed only on
 * the product page — the one screen where the reader is already looking at a
 * product. Home is where a returning shopper actually needs their trail: it is
 * the screen they land on, and the thing they were considering yesterday is the
 * likeliest thing they came back for.
 *
 * A SEPARATE component from the product page's rail rather than a reuse, and
 * the difference is the point: that one RECORDS the product being viewed and
 * then renders the rest. Home is not a product view, so writing to the trail
 * from here would put a phantom entry in a shopper's history for a page that
 * names no product. This one only reads.
 *
 * The list lives in localStorage — it is one person's browsing on one device,
 * and storing it server-side would mean the demo quietly builds a profile of
 * everyone who clicks around. Ids are resolved through a server action rather
 * than trusted: anything the browser holds outlives the row it names, and
 * `db:reset` reissues every uuid (CLAUDE.md). An id that no longer resolves
 * drops out, which is how the list prunes itself.
 *
 * Renders nothing on the server and nothing until three entries resolve, so a
 * first-time visitor meets no stub and there is no hydration mismatch to
 * suppress: the first client render matches the server's empty one.
 */
export function RecentlyViewedBand({
  excludeIds,
  heading,
}: {
  /** Ids the server bands above already used — a product belongs to one band. */
  excludeIds: string[];
  heading: string;
}) {
  const [cards, setCards] = React.useState<RecentlyViewedCard[]>([]);

  /*
   * `excludeIds` is a fresh array on every render and so can never be a stable
   * dependency. Joining it gives one that changes only when the CONTENTS do —
   * extracted to a variable because a complex expression inside a dependency
   * array cannot be checked statically.
   */
  const excludeKey = excludeIds.join(',');

  React.useEffect(() => {
    let cancelled = false;

    let ids: string[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      ids = raw ? (JSON.parse(raw) as string[]).filter((id) => typeof id === 'string') : [];
    } catch {
      /* Private browsing or malformed storage — the band is not worth an error. */
      ids = [];
    }

    /*
     * The page's no-repeat rule is a PREFERENCE here, not a filter, and this is
     * the one band where that is right.
     *
     * Everywhere else on this page a repeat is the catalogue looking small:
     * "today's deals" and "bestsellers in electronics" are two editorial
     * questions with one answer. This band asks a third question — what did YOU
     * look at — and a shopper is not confused to meet their own phone again
     * under that heading. Meanwhile the trail is drawn from the same eighty
     * products the rails above are, so a hard exclusion starved it to nothing
     * on almost every visit: the feature existed and never rendered.
     *
     * So unseen products lead, and the ones the page already used fill in only
     * when there would otherwise be no band at all.
     */
    const excluded = new Set(excludeKey ? excludeKey.split(',') : []);
    const fresh = ids.filter((id) => !excluded.has(id));
    const reused = ids.filter((id) => excluded.has(id));
    const wanted = [...fresh, ...reused].slice(0, MAX_ENTRIES);
    if (wanted.length < MIN_TO_RENDER) return;

    void recentlyViewedProducts(wanted).then((rows) => {
      if (!cancelled && rows.length >= MIN_TO_RENDER) setCards(rows);
    });

    return () => {
      cancelled = true;
    };
  }, [excludeKey]);

  if (cards.length < MIN_TO_RENDER) return null;

  return (
    <section className="space-y-5">
      {/* No "see all" beside it: there is no page that lists a private,
          device-local trail, and a link that led anywhere else would be lying
          about what this band is. */}
      <h2 className="text-foreground text-xl font-bold">{heading}</h2>

      <Rail label={heading}>
        {cards.map((card) => (
          <div key={card.id} className="relative">
            <ProductCard
              slug={card.slug}
              title={card.title}
              shopName={card.shopName}
              shopFloor={card.shopFloor}
              price={card.price}
              discountPrice={card.discountPrice}
              rating={card.rating}
              reviewCount={card.reviewCount}
              imagePath={card.imagePath}
              stock={card.stock}
              // Keyed for the same reason ProductGrid's are: both are client
              // elements created here and passed to a client component as
              // props, so they cross the RSC boundary with `key: null` and
              // React reconciles them as a keyless array (CLAUDE.md).
              wishlistSlot={
                <WishlistButton key="wishlist" productId={card.id} initialSaved={card.saved} />
              }
              quickAddSlot={
                <QuickAddButton key="quick-add" productId={card.id} disabled={card.stock <= 0} />
              }
            />
          </div>
        ))}
      </Rail>
    </section>
  );
}
