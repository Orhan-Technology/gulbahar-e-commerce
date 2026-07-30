import { and, eq, sql } from 'drizzle-orm';

import { db } from '..';
import { products, shops } from '../schema';

/**
 * The shopkeeper's setup checklist, checked against REAL DATA (Prompt C5).
 *
 * A newly approved shop lands on a dashboard of zeros with no idea what to do
 * next. This is the answer, and every step is verified rather than remembered:
 * there is no `setup_completed_step_3` column anywhere, because a stored flag
 * drifts from the thing it claims — a shop that deletes its logo would keep a
 * tick beside "add a logo" forever.
 *
 * The consequence is that the guide is always true, and that removing something
 * un-ticks its step. That is correct: the guide is a description of the shop's
 * readiness, not a record of what the owner once clicked.
 */

export type SetupStepKey =
  | 'logo'
  | 'banner'
  | 'description'
  | 'location'
  | 'phone'
  | 'products'
  | 'verification';

export type SetupStep = {
  key: SetupStepKey;
  done: boolean;
  /** Where to go to finish it. */
  href: string;
};

/** Three products is the point at which a shop page stops looking abandoned. */
const PRODUCT_TARGET = 3;

export async function shopSetupSteps(shopId: string): Promise<{
  steps: SetupStep[];
  completed: number;
  total: number;
  /** True while the mall has not approved the shop yet (PRD §7.1). */
  pending: boolean;
}> {
  const [shop] = await db
    .select({
      status: shops.status,
      logoPath: shops.logoPath,
      bannerPath: shops.bannerPath,
      description: shops.description,
      floor: shops.floor,
      unitNumber: shops.unitNumber,
      phone: shops.phone,
      verifiedAt: shops.verifiedAt,
    })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);

  const [counts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.shopId, shopId)));

  const productCount = Number(counts?.total ?? 0);

  const steps: SetupStep[] = [
    { key: 'logo', done: Boolean(shop?.logoPath), href: '/dashboard/profile' },
    { key: 'banner', done: Boolean(shop?.bannerPath), href: '/dashboard/profile' },
    {
      key: 'description',
      // A one-word description is not a description; forty characters is about
      // one honest sentence in either language.
      done: (shop?.description?.fa ?? '').trim().length >= 40,
      href: '/dashboard/profile',
    },
    {
      key: 'location',
      done: shop?.floor !== null && Boolean(shop?.unitNumber),
      href: '/dashboard/profile',
    },
    { key: 'phone', done: Boolean(shop?.phone), href: '/dashboard/profile' },
    { key: 'products', done: productCount >= PRODUCT_TARGET, href: '/dashboard/products/new' },
    {
      key: 'verification',
      done: Boolean(shop?.verifiedAt),
      href: '/dashboard/settings/verification',
    },
  ];

  return {
    steps,
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    pending: shop?.status === 'pending',
  };
}
