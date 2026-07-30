'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { ADMIN_SECTIONS } from '@/lib/admin-sections';
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
 * Dark, where every other surface in the product is light. That is the point:
 * this is the only place in the system where someone can unpublish a tenant's
 * shop, and the rail should not be mistakable for the shopkeeper's own panel at
 * a glance across a room.
 *
 * Counts are passed in as pre-FORMATTED strings, so the numerals are Persian in
 * Dari without this component needing the locale.
 */
export function AdminNav({ counts }: { counts: AdminBadgeCounts }) {
  const t = useTranslations('adminNav');
  const pathname = usePathname();

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={t('label')}
      className="bg-neutral-900 lg:min-h-screen lg:w-56 lg:shrink-0"
    >
      <div className="hidden px-5 pt-5 pb-6 lg:block">
        <p className="text-primary-foreground text-sm font-bold">{t('brand')}</p>
        <p className="text-2xs text-neutral-600">{t('subtitle')}</p>
      </div>

      <ul className="flex scrollbar-none gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-6">
        {ADMIN_SECTIONS.map((item) => {
          const active = isActive(item.href, item.exact);
          const badge = item.badge ? counts[item.badge] : null;

          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-control flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors duration-150',
                  active
                    ? 'bg-primary-700 text-primary-foreground font-bold'
                    : 'hover:text-primary-foreground text-neutral-400 hover:bg-neutral-800',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{t(item.key as never)}</span>
                {/* Only shown when there is something to act on, so the sidebar is
                    quiet when the queues are clear. */}
                {badge && (
                  <Badge variant="destructive" className="ms-auto">
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
