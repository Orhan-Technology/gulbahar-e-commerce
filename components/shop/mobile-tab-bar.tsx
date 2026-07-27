'use client';

import { useTranslations } from 'next-intl';
import { Heart, Home, LayoutGrid, Search, User } from 'lucide-react';

import { Link, usePathname } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', icon: Home, key: 'home' },
  { href: '/categories', icon: LayoutGrid, key: 'categories' },
  { href: '/search', icon: Search, key: 'search' },
  { href: '/account/wishlist', icon: Heart, key: 'wishlist' },
  { href: '/account', icon: User, key: 'account' },
] as const;

/**
 * Mobile bottom tab bar (PRD §5.1). Hidden from md upwards, where the header nav
 * takes over.
 *
 * The bar is fixed, so the (shop) layout adds matching bottom padding — without
 * it the last row of a product grid sits permanently under the bar.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md md:hidden"
      aria-label={t('mobileNav')}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {TABS.map(({ href, icon: Icon, key }) => {
          // Exact match for home; prefix match elsewhere so nested routes keep
          // their tab highlighted.
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-xs transition-colors duration-150',
                  active ? 'text-primary' : 'text-neutral-500',
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'fill-primary-50')} aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
