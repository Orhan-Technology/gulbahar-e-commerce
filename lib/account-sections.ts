import {
  Headphones,
  Heart,
  MapPin,
  Package,
  Settings,
  ShieldCheck,
  Star,
  type LucideIcon,
} from 'lucide-react';

/**
 * The account area's sections, in reading order (Prompt A2).
 *
 * Declared in a module with NO `'use client'` on purpose. The desktop nav needs
 * `usePathname` for its active state so it is a client component, while the
 * mobile hub renders the same list from the server — and a constant exported
 * from a `'use client'` module reaches a server component as a client
 * reference, not a value (CLAUDE.md). Both sides therefore import this
 * directly and neither crosses the RSC boundary with it.
 *
 * `countKey` names which of the account counts belongs on the row; sections
 * with nothing to count (security, settings, support) simply omit it rather
 * than rendering a zero, which would read as "you have none" for a section
 * that was never about quantity.
 */
export type AccountSection = {
  key: 'orders' | 'wishlist' | 'addresses' | 'reviews' | 'security' | 'settings' | 'support';
  href: string;
  icon: LucideIcon;
  countKey?: 'orders' | 'wishlist' | 'reviews' | 'addresses';
};

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { key: 'orders', href: '/account/orders', icon: Package, countKey: 'orders' },
  { key: 'wishlist', href: '/account/wishlist', icon: Heart, countKey: 'wishlist' },
  { key: 'addresses', href: '/account/addresses', icon: MapPin, countKey: 'addresses' },
  { key: 'reviews', href: '/account/reviews', icon: Star, countKey: 'reviews' },
  { key: 'security', href: '/account/security', icon: ShieldCheck },
  { key: 'settings', href: '/account/settings', icon: Settings },
  { key: 'support', href: '/account/support', icon: Headphones },
];

export type AccountCounts = {
  orders: number;
  wishlist: number;
  reviews: number;
  addresses: number;
};
