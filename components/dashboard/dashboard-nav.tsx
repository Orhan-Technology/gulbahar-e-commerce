'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  BarChart3,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  MessageCircleQuestion,
  MoreHorizontal,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Store,
} from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { formatNumber } from '@/lib/format';
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

/**
 * Bottom tabs, and the desktop rail's lead group.
 *
 * THREE destinations plus More, not four plus More. Promotions moved into the
 * overflow because five tabs across a 390px screen leaves each label about
 * 70px, which truncates «تبلیغات» and «محصولات» in Dari — and because the
 * ranking is not close: a shopkeeper opens orders and products every day and
 * promotions when they are buying a placement. The desktop rail still lists it
 * at full width, where nothing has to be given up to show it.
 */
const PRIMARY: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, key: 'dashboard', exact: true },
  { href: '/dashboard/orders', icon: ShoppingBag, key: 'orders' },
  { href: '/dashboard/products', icon: Package, key: 'products' },
];

const SECONDARY: NavItem[] = [
  { href: '/dashboard/promotions', icon: Megaphone, key: 'promotions' },
  { href: '/dashboard/questions', icon: MessageCircleQuestion, key: 'questions' },
  { href: '/dashboard/reviews', icon: Star, key: 'reviews' },
  { href: '/dashboard/reports', icon: BarChart3, key: 'reports' },
  { href: '/dashboard/profile', icon: Store, key: 'profile' },
  { href: '/dashboard/settings', icon: Settings, key: 'settings' },
];

/**
 * Which count belongs on which row. Only three rows are queues; everything else
 * returns zero and renders no badge — a "0" beside Settings would be a number
 * that means nothing.
 */
function badgeFor(counts: DashboardBadgeCounts | undefined, key: string): number {
  if (!counts) return 0;
  if (key === 'orders') return counts.orders;
  if (key === 'questions') return counts.questions;
  if (key === 'reviews') return counts.reviews;
  return 0;
}

function useActive() {
  const pathname = usePathname();
  return (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export type DashboardBadgeCounts = {
  orders: number;
  questions: number;
  reviews: number;
};

/**
 * Desktop sidebar, hidden below md.
 *
 * BADGES ON BOTH CONSOLES (Prompt C3). The admin rail has carried counts since
 * D2 and the shopkeeper's did not, which meant the person with actual work
 * waiting was the one who had to go looking for it. Counts are passed down
 * pre-computed by the layout — the rail is a client component for its pathname,
 * and a number fetched on the client arrives after first paint.
 */
export function DashboardSidebar({ counts }: { counts?: DashboardBadgeCounts }) {
  const t = useTranslations('dashboardNav');
  const locale = useLocale();
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
                  pressable,
                  'rounded-control flex items-center gap-2.5 px-3 py-2 text-sm transition-[color,background-color,scale] duration-150 ease-out',
                  active
                    ? 'bg-primary-700 text-primary-foreground font-semibold'
                    : 'text-neutral-700 hover:bg-neutral-200',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t(item.key)}</span>
                {badgeFor(counts, item.key) > 0 && (
                  <span
                    className={cn(
                      'rounded-pill text-2xs min-w-5 px-1.5 py-0.5 text-center font-bold tabular-nums',
                      active ? 'bg-primary-foreground text-primary-700' : 'bg-danger text-primary-foreground',
                    )}
                  >
                    {formatNumber(badgeFor(counts, item.key), locale)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Mobile bottom tabs, hidden from md up.
 *
 * `pendingOrders` is passed down from the layout rather than fetched here: the
 * bar is a client component so it can read the pathname, and a count fetched on
 * the client would arrive after first paint — a badge that pops in a beat late
 * is worse than one that was always there.
 */
export function DashboardTabBar({ pendingOrders = 0 }: { pendingOrders?: number }) {
  const t = useTranslations('dashboardNav');
  const locale = useLocale();
  const isActive = useActive();
  const moreActive = SECONDARY.some((item) => isActive(item.href));

  return (
    <nav
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md md:hidden"
      aria-label={t('label')}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {PRIMARY.map((item) => (
          <Tab
            key={item.key}
            href={item.href}
            icon={item.icon}
            label={t(item.key)}
            active={isActive(item.href, item.exact)}
            badge={item.key === 'orders' && pendingOrders > 0 ? pendingOrders : 0}
            badgeLabel={
              item.key === 'orders' && pendingOrders > 0
                ? t('pendingOrders', {
                    n: pendingOrders,
                    count: formatNumber(pendingOrders, locale),
                  })
                : undefined
            }
            locale={locale}
          />
        ))}
        <Tab
          href="/dashboard/more"
          icon={MoreHorizontal}
          label={t('more')}
          active={moreActive}
          locale={locale}
        />
      </ul>
    </nav>
  );
}

function Tab({
  href,
  icon: Icon,
  label,
  active,
  badge = 0,
  badgeLabel,
  locale,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
  badgeLabel?: string;
  locale: string;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          pressable,
          'relative flex flex-col items-center gap-0.5 py-2 text-xs transition-[color,scale] duration-150 ease-out',
          active ? 'text-primary font-semibold' : 'text-neutral-500',
        )}
      >
        <span className="relative">
          <Icon className="h-5 w-5" aria-hidden />
          {badge > 0 && (
            <span
              className="rounded-pill bg-danger text-danger-fg text-2xs absolute -top-1.5 flex h-4 min-w-4 items-center justify-center px-1 font-bold tabular-nums -end-2"
              // The number is decoration for anyone who can see it; the tab's
              // accessible name has to say what it counts.
              aria-hidden
            >
              {formatNumber(badge, locale)}
            </span>
          )}
        </span>
        {label}
        {badgeLabel && <span className="sr-only">{badgeLabel}</span>}

        {/*
          The active marker: a short bar riding the top edge of the tab, which
          is the one place on a bottom bar that is not competing with the icon
          or the label. Colour alone was the previous signal and it is a weak
          one at 12px on a lit shop counter.
        */}
        <span
          className={cn(
            'bg-primary rounded-pill absolute inset-x-0 top-0 mx-auto h-[3px] w-8 transition-opacity duration-150',
            active ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden
        />
      </Link>
    </li>
  );
}

export { SECONDARY as DASHBOARD_SECONDARY_NAV };
