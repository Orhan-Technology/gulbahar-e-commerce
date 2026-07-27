'use client';

import { useTranslations } from 'next-intl';
import {
  BarChart3,
  FolderTree,
  LayoutDashboard,
  Megaphone,
  Package,
  ShoppingBag,
  Star,
  Store,
  Users,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Link, usePathname } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type AdminBadgeCounts = {
  shops: string | null;
  reviews: string | null;
  promotions: string | null;
  orders: string | null;
};

/**
 * Admin sidebar (PRD §7).
 *
 * Desktop-oriented, unlike the shop dashboard: mall management works at a desk. It
 * stays a fixed rail at lg and collapses to a horizontal scroller below that, so
 * the surface is still usable on a tablet during the walkthrough without pretending
 * to be a phone-first design.
 *
 * Counts are passed in as pre-FORMATTED strings, so the numerals are Persian in
 * Dari without this component needing the locale.
 */
const ITEMS = [
  { href: '/admin', icon: LayoutDashboard, key: 'overview', exact: true, badge: null },
  { href: '/admin/shops', icon: Store, key: 'shops', badge: 'shops' },
  { href: '/admin/products', icon: Package, key: 'products', badge: null },
  { href: '/admin/categories', icon: FolderTree, key: 'categories', badge: null },
  { href: '/admin/reviews', icon: Star, key: 'reviews', badge: 'reviews' },
  { href: '/admin/promotions', icon: Megaphone, key: 'promotions', badge: 'promotions' },
  { href: '/admin/revenue', icon: Wallet, key: 'revenue', badge: null },
  { href: '/admin/orders', icon: ShoppingBag, key: 'orders', badge: 'orders' },
  { href: '/admin/reports', icon: BarChart3, key: 'reports', badge: null },
  { href: '/admin/users', icon: Users, key: 'users', badge: null },
] as const;

export function AdminNav({ counts }: { counts: AdminBadgeCounts }) {
  const t = useTranslations('adminNav');
  const pathname = usePathname();

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={t('label')}
      className="border-border bg-card border-b lg:h-screen lg:w-56 lg:shrink-0 lg:border-e lg:border-b-0"
    >
      <div className="hidden px-4 py-4 lg:block">
        <p className="text-primary text-sm font-bold">{t('brand')}</p>
        <p className="text-muted-foreground text-xs">{t('subtitle')}</p>
      </div>

      <ul className="flex scrollbar-none gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:p-2">
        {ITEMS.map((item) => {
          const active = isActive(item.href, 'exact' in item ? item.exact : false);
          const badge = item.badge ? counts[item.badge] : null;

          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-control flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150',
                  active
                    ? 'bg-primary-50 text-primary font-medium'
                    : 'text-foreground hover:bg-neutral-50',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{t(item.key)}</span>
                {/* Only shown when there is something to act on, so the sidebar is
                    quiet when the queues are clear. */}
                {badge && (
                  <Badge variant="warning" className="ms-auto">
                    {badge}
                  </Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
