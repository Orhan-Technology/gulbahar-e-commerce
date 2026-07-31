import {
  BadgeCheck,
  BarChart3,
  FolderTree,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * The admin console's sections, in nav order (Prompt A4).
 *
 * Declared in a module with NO `'use client'` for the same reason
 * lib/account-sections.ts is: the sidebar needs `usePathname` for its active
 * state so it is a client component, while the overview renders the same list
 * from the server as section cards — and a constant exported from a
 * `'use client'` module reaches a server component as a client reference rather
 * than a value (CLAUDE.md). One list, two renderers, no drift.
 *
 * `badge` names which pending count belongs on the row; sections with no queue
 * omit it rather than showing a zero, which would read as "nothing is wrong"
 * for something that was never a queue.
 */
export type AdminSection = {
  href: string;
  key: string;
  icon: LucideIcon;
  /** Overview matches exactly — every other path also starts with /admin. */
  exact?: boolean;
  badge?: 'shops' | 'verifications' | 'reviews' | 'promotions' | 'orders';
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: '/admin', icon: LayoutDashboard, key: 'overview', exact: true },
  { href: '/admin/shops', icon: Store, key: 'shops', badge: 'shops' },
  { href: '/admin/verifications', icon: BadgeCheck, key: 'verifications', badge: 'verifications' },
  { href: '/admin/products', icon: Package, key: 'products' },
  { href: '/admin/categories', icon: FolderTree, key: 'categories' },
  { href: '/admin/reviews', icon: Star, key: 'reviews', badge: 'reviews' },
  { href: '/admin/promotions', icon: Megaphone, key: 'promotions', badge: 'promotions' },
  { href: '/admin/revenue', icon: Wallet, key: 'revenue' },
  { href: '/admin/orders', icon: ShoppingBag, key: 'orders', badge: 'orders' },
  { href: '/admin/reports', icon: BarChart3, key: 'reports' },
  { href: '/admin/users', icon: Users, key: 'users' },
  { href: '/admin/settings', icon: Settings, key: 'settings' },
];
