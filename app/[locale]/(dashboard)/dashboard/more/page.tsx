import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BarChart3,
  ChevronRight,
  LifeBuoy,
  MessageCircleQuestion,
  Phone,
  Settings,
  Star,
  Store,
} from 'lucide-react';

import { pickLocale } from '@/lib/db/localized';
import { siteSettings } from '@/lib/db/queries/settings';
import { formatPhone } from '@/lib/format';
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
  const help = await getTranslations('dashboardNav.help');

  const settings = await siteSettings();

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

      {/*
        HELP, with a number that dials (Prompt: no help affordance anywhere).
        The panel had no way to reach a human at all — a tenant stuck on a
        rejected application or an order they cannot advance had the mall office
        two floors away and no phone number on any screen. A `tel:` link, not a
        support form: this persona rings people, and there is no ticketing system
        in the demo to pretend otherwise.
      */}
      <section className="rounded-card border-border bg-card space-y-2 border p-4">
        <div className="flex items-center gap-2">
          <LifeBuoy className="text-primary h-4 w-4" aria-hidden />
          <h2 className="text-sm font-bold">{help('heading')}</h2>
        </div>
        <p className="text-muted-foreground text-xs">{help('body')}</p>

        <a
          href={`tel:${settings.supportPhone}`}
          className="rounded-control border-border hover:border-primary flex items-center gap-3 border p-3"
        >
          <span className="rounded-control bg-primary-50 text-primary-700 flex h-9 w-9 shrink-0 items-center justify-center">
            <Phone className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{help('callOffice')}</span>
            <span className="text-muted-foreground block text-xs" dir="ltr">
              {formatPhone(settings.supportPhone, locale)}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 rtl:rotate-180" aria-hidden />
        </a>

        <p className="text-muted-foreground text-xs">
          {help('address', { address: pickLocale(settings.address, locale) })}
        </p>
      </section>
    </div>
  );
}
