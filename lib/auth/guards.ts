import type { Session } from 'next-auth';

import { redirect } from '../i18n/navigation';
import type { UserRole } from '../db/schema';
import { auth } from '.';

/**
 * Route-group protection (Prompt 3.2 item 5).
 *
 * Enforced in server-component layouts rather than in proxy.ts, because the auth
 * config imports the database and proxy.ts runs on the edge runtime. Doing it in
 * the layout also means the check runs for every nested route in the group
 * without each page repeating it.
 *
 * Every redirect goes through next-intl's locale-aware `redirect`, so a Dari user
 * bounced from /fa/admin lands on /fa/... and never gets silently switched to
 * English (PRD §10.3).
 */

export type SessionUser = Session['user'];

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  return session?.user ?? null;
}

/** Any signed-in user. Used by /account and checkout. */
export async function requireUser(locale: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user?.id) {
    redirect({ href: '/account/sign-in', locale });
  }
  return user as SessionUser;
}

export async function requireRole(locale: string, role: UserRole): Promise<SessionUser> {
  const user = await requireUser(locale);
  if (user.role !== role) {
    // Bounce to the storefront rather than the sign-in page: the user IS signed
    // in, they simply have no business on this surface.
    redirect({ href: '/', locale });
  }
  return user;
}

/**
 * (dashboard) requires a shopkeeper WITH a shop.
 *
 * A shopkeeper account with no shop_members row has nothing to manage, so it is
 * sent to registration instead of an empty dashboard.
 *
 * An admin is sent to their OWN console rather than to registration. The
 * previous branch let admins through "for support purposes", but an admin
 * carries no shopId, so they fell into the `!user.shopId` redirect and landed
 * on /dashboard/register-shop — which `registerShop` refuses for admins. It
 * was a dead end dressed as an affordance. Real support access means acting as
 * a named shop, which is a scoped feature this build does not have; until it
 * does, saying so with a redirect beats a loop.
 */
export async function requireShopkeeper(locale: string): Promise<SessionUser & { shopId: string }> {
  const user = await requireUser(locale);

  if (user.role === 'admin') {
    redirect({ href: '/admin', locale });
  }
  if (user.role !== 'shopkeeper') {
    redirect({ href: '/', locale });
  }
  if (!user.shopId) {
    redirect({ href: '/dashboard/register-shop', locale });
  }

  return user as SessionUser & { shopId: string };
}

/** (admin) requires the admin role. */
export async function requireAdmin(locale: string): Promise<SessionUser> {
  return requireRole(locale, 'admin');
}

/** Non-throwing variant for conditional UI (e.g. showing a wishlist heart). */
export async function optionalUser(): Promise<SessionUser | null> {
  return currentUser();
}
