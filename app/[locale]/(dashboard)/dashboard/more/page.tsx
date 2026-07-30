import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BarChart3,
  ChevronRight,
  MessageCircleQuestion,
  Settings,
  Star,
  Store,
} from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';

/**
 * The "More" tab (PRD §6.1).
 *
 * Only exists on mobile: on desktop these four live in the sidebar. Rather than
 * hiding them behind a menu, this is a real page so a phone user gets a full-size
 * tap target for each.
 */
const ITEMS = [
  { href: '/dashboard/questions', icon: MessageCircleQuestion, key: 'questions' },
  { href: '/dashboard/reviews', icon: Star, key: 'reviews' },
  { href: '/dashboard/reports', icon: BarChart3, key: 'reports' },
  { href: '/dashboard/profile', icon: Store, key: 'profile' },
  { href: '/dashboard/settings', icon: Settings, key: 'settings' },
] as const;

export default async function MorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboardNav');

  return (
    <div className="space-y-4 p-4 md:hidden">
      <h1 className="text-base font-bold">{t('more')}</h1>
      <ul className="divide-border rounded-card border-border bg-card divide-y overflow-hidden border">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 p-4 transition-colors duration-150 hover:bg-neutral-50"
              >
                <span className="rounded-control bg-primary-50 text-primary-700 flex h-9 w-9 items-center justify-center">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex-1 text-sm font-medium">{t(item.key)}</span>
                <ChevronRight className="h-4 w-4 text-neutral-400 rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
