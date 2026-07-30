'use client';

import { useLocale, useTranslations } from 'next-intl';
import { User } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { SignOutButton } from '@/components/shop/account/sign-out-button';
import { ACCOUNT_SECTIONS, type AccountCounts } from '@/lib/account-sections';
import { formatNumber } from '@/lib/format';
import { Link, usePathname } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The account area's persistent section nav — desktop only (Prompt A2).
 *
 * Hidden below `lg` because the mobile answer is not a squeezed sidebar but the
 * hub page itself: on a phone `/account` IS the nav, a full-width list of rows
 * that each lead to their own route. Rendering both and hiding one would put a
 * second, thumb-unreachable copy of the same navigation on every screen.
 *
 * A client component only for `usePathname`, which is what lets the current
 * section carry its own state instead of every row looking equally likely.
 */
export function AccountNav({ counts }: { counts: AccountCounts }) {
  const t = useTranslations('account');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav className="hidden lg:block" aria-label={t('navLabel')}>
      <ul className="space-y-0.5">
        <li>
          <NavRow
            href="/account"
            icon={<User className="h-4 w-4 shrink-0" aria-hidden />}
            label={t('overview')}
            // Exact match: every section path also starts with /account, so a
            // prefix test would light the overview row on all of them.
            active={pathname === '/account'}
          />
        </li>

        {ACCOUNT_SECTIONS.map((section) => {
          const Icon = section.icon;
          const count = section.countKey ? counts[section.countKey] : undefined;
          return (
            <li key={section.key}>
              <NavRow
                href={section.href}
                icon={<Icon className="h-4 w-4 shrink-0" aria-hidden />}
                label={t(`sections.${section.key}.title` as never)}
                badge={count ? formatNumber(count, locale) : undefined}
                active={pathname.startsWith(section.href)}
              />
            </li>
          );
        })}
      </ul>

      {/* Sign out sits below the sections, separated, and reads as the quiet
          thing it is — the same ghost button and the same confirm as the hub's,
          because there is one way to leave rather than two that could drift. */}
      <div className="border-border mt-2 border-t pt-2">
        <SignOutButton className="w-full justify-start px-3 text-neutral-600" />
      </div>
    </nav>
  );
}

function NavRow({
  href,
  icon,
  label,
  badge,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        pressable,
        'rounded-control flex items-center gap-2.5 px-3 py-2 text-sm transition-[background-color,color,scale] duration-150 ease-out',
        active
          ? 'bg-primary-50 text-primary-800 font-semibold'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-foreground',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && <span className="text-2xs text-neutral-500 tabular-nums">{badge}</span>}
    </Link>
  );
}
