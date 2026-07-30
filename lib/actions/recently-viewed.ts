'use server';

import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { pickLocale } from '../db/localized';
import { wishlistedProductIds } from '../db/queries/home';
import { productsByIds } from '../db/queries/rails';
import type { LocalizedText } from '../db/schema';

export type RecentlyViewedCard = {
  id: string;
  slug: string;
  title: string;
  shopName: string;
  shopFloor: number | null;
  price: number;
  discountPrice: number | null;
  stock: number;
  imagePath: string | null;
  rating: number;
  reviewCount: number;
  saved: boolean;
};

/**
 * Turns a browser's recently-viewed ids into cards (Prompt P5).
 *
 * The LIST is not stored server-side and should not be: it is one person's
 * browsing history, it belongs to the device, and putting it in the database
 * would mean a demo that quietly builds a profile of whoever clicks around.
 * The browser keeps the ids; this fills them in.
 *
 * Ids are VALIDATED and the result is re-ordered to match the request, because
 * `in (…)` has no order and the rail's whole meaning is "most recent first". An
 * id naming a row that no longer exists — after `db:reset`, every uuid is
 * reissued (CLAUDE.md) — simply returns nothing rather than a broken card,
 * which is also how the list cleans itself up.
 */
export async function recentlyViewedProducts(ids: string[]): Promise<RecentlyViewedCard[]> {
  const parsed = z.array(z.string().uuid()).max(12).safeParse(ids);
  if (!parsed.success || parsed.data.length === 0) return [];

  const [rows, user] = await Promise.all([productsByIds(parsed.data), currentUser()]);
  const saved = await wishlistedProductIds(
    user?.id,
    rows.map((row) => row.id),
  );

  const byId = new Map(rows.map((row) => [row.id, row]));
  const { getLocale } = await import('next-intl/server');
  const locale = await getLocale();

  return parsed.data.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];

    return [
      {
        id: row.id,
        slug: row.slug,
        title: pickLocale(row.title as LocalizedText, locale),
        shopName: pickLocale(row.shopName as LocalizedText, locale),
        shopFloor: row.shopFloor,
        price: row.price,
        discountPrice: row.discountPrice,
        stock: row.stock,
        imagePath: row.imagePath,
        rating: Number(row.rating),
        reviewCount: Number(row.reviewCount),
        saved: saved.has(row.id),
      },
    ];
  });
}
