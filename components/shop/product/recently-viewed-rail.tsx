'use client';

import * as React from 'react';

import { ProductCard } from '@/components/custom/product-card';
import { QuickAddButton } from '@/components/shop/quick-add-button';
import { Rail } from '@/components/shop/rail';
import { WishlistButton } from '@/components/shop/wishlist-button';
import {
  recentlyViewedProducts,
  type RecentlyViewedCard,
} from '@/lib/actions/recently-viewed';

const STORAGE_KEY = 'gulbahar.recentlyViewed';
/** Twelve is two full rails; beyond that it is an archive, not a trail. */
const MAX_ENTRIES = 12;
/** Fewer than this and it is a stub, which reads as a broken rail. */
const MIN_TO_RENDER = 3;

/**
 * "Recently viewed" — the reader's own trail (Prompt P5).
 *
 * The list lives in localStorage, not the database. It is one person's browsing
 * history on one device; storing it server-side would mean the demo quietly
 * builds a profile of everyone who clicks around, for a rail whose whole value
 * is that it is local and immediate.
 *
 * It renders NOTHING until three entries exist, so a first-time visitor never
 * meets a one-card rail — and nothing at all on the server, so there is no
 * hydration mismatch to suppress: the first client render matches the server's
 * empty one, and the rail appears on the effect that reads storage.
 *
 * Ids are resolved through a server action rather than being trusted: anything
 * the browser holds outlives the row it names, and `db:reset` reissues every
 * uuid (CLAUDE.md). An id that no longer resolves simply drops out, which is
 * how the list prunes itself.
 */
export function RecentlyViewedRail({
  currentProductId,
  excludeIds,
  heading,
}: {
  currentProductId: string;
  /** Ids the server rails already used — a product belongs to one rail only. */
  excludeIds: string[];
  /** Passed but unused directly: the action localises, using the request locale. */
  locale?: string;
  heading: string;
}) {
  const [cards, setCards] = React.useState<RecentlyViewedCard[]>([]);

  /*
   * `excludeIds` is a fresh array on every render, so it can never be a stable
   * dependency. Joining it gives one that changes only when the CONTENTS do —
   * extracted to a variable because a complex expression inside the dependency
   * array cannot be checked statically.
   */
  const excludeKey = excludeIds.join(',');

  React.useEffect(() => {
    let cancelled = false;

    // Read, drop this product, prepend it, write back — in that order, so the
    // rail never shows the page you are on and the trail stays newest-first.
    let ids: string[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      ids = raw ? (JSON.parse(raw) as string[]).filter((id) => typeof id === 'string') : [];
    } catch {
      ids = [];
    }

    const withoutCurrent = ids.filter((id) => id !== currentProductId);
    const next = [currentProductId, ...withoutCurrent].slice(0, MAX_ENTRIES);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Private browsing or a full quota — the rail is not worth an error. */
    }

    const excluded = new Set(excludeKey ? excludeKey.split(',') : []);
    const wanted = withoutCurrent.filter((id) => !excluded.has(id)).slice(0, MAX_ENTRIES);
    if (wanted.length < MIN_TO_RENDER) return;

    void recentlyViewedProducts(wanted).then((rows) => {
      if (!cancelled && rows.length >= MIN_TO_RENDER) setCards(rows);
    });

    return () => {
      cancelled = true;
    };
  }, [currentProductId, excludeKey]);

  if (cards.length < MIN_TO_RENDER) return null;

  return (
    <section className="space-y-3">
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
