'use client';

import { useTranslations } from 'next-intl';
import {
  BarChart3,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  MoreHorizontal,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Store,
} from 'lucide-react';

import { Link, usePathname } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Shop-panel navigation (PRD §6).
 *
 * Mobile-first by requirement, not preference: tenants run their shop from a phone
 * behind the counter, so the five things they touch most get bottom tabs, and the
 * rest live under "More". Desktop gets the full sidebar.
 */
type NavItem = {
  href: string;
  icon: LucideIcon;
  key: string;
  /** True only for /dashboard, which would otherwise match every nested route. */
  exact?: boolean;
};

const PRIMARY: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, key: 'dashboard', exact: true },
  { href: '/dashboard/orders', icon: ShoppingBag, key: 'orders' },
  { href: '/dashboard/products', icon: Package, key: 'products' },
  { href: '/dashboard/promotions', icon: Megaphone, key: 'promotions' },
];

const SECONDARY: NavItem[] = [
  { href: '/dashboard/reviews', icon: Star, key: 'reviews' },
  { href: '/dashboard/reports', icon: BarChart3, key: 'reports' },
  { href: '/dashboard/profile', icon: Store, key: 'profile' },
  { href: '/dashboard/settings', icon: Settings, key: 'settings' },
];

function useActive() {
  const pathname = usePathname();
  return (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar, hidden below md. */
export function DashboardSidebar() {
  const t = useTranslations('dashboardNav');
  const isActive = useActive();

  return (
    <nav
      className="border-border hidden w-56 shrink-0 border-e bg-neutral-50 md:block"
      aria-label={t('label')}
    >
      <ul className="sticky top-0 space-y-1 p-3">
        {[...PRIMARY, ...SECONDARY].map((item) => {
          const active = isActive(item.href, item.exact);
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-control flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150',
                  active
                    ? 'bg-primary-700 text-primary-foreground font-semibold'
                    : 'text-neutral-700 hover:bg-neutral-200',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile bottom tabs, hidden from md up. */
export function DashboardTabBar() {
  const t = useTranslations('dashboardNav');
  const isActive = useActive();
  const moreActive = SECONDARY.some((item) => isActive(item.href));

  return (
    <nav
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md md:hidden"
      aria-label={t('label')}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {PRIMARY.map((item) => {
          const active = isActive(item.href, item.exact);
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-xs transition-colors duration-150',
                  active ? 'text-primary' : 'text-neutral-500',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <Link
            href="/dashboard/more"
            aria-current={moreActive ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-xs transition-colors duration-150',
              moreActive ? 'text-primary' : 'text-neutral-500',
            )}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            {t('more')}
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export { SECONDARY as DASHBOARD_SECONDARY_NAV };
