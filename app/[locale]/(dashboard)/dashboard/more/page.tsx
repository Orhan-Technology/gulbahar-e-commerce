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

import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopQuestionCounts } from '@/lib/db/queries/questions';
import { shopReviewCounts } from '@/lib/db/queries/shop-reviews';
import { siteSettings } from '@/lib/db/queries/settings';
import { formatNumber, formatPhone } from '@/lib/format';
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

  const user = await requireShopkeeper(locale);

  /*
   * THE ROWS CARRY THE SAME COUNTS THE DESKTOP RAIL DOES (Prompt C21).
   * This page is the phone's whole second half of the panel, and it listed
   * «پرسش‌ها» and «نظرها» as two identical rows with nothing on them while the
   * sidebar on a machine nobody in this mall uses said ۳ and ۱۳.
   */
  const [settings, questionCounts, reviewCounts] = await Promise.all([
    siteSettings(),
    shopQuestionCounts(user.shopId),
    shopReviewCounts(user.shopId),
  ]);

  const counts: Record<string, number> = {
    questions: questionCounts.pending,
    reviews: reviewCounts.unanswered,
  };

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
                {(counts[item.key] ?? 0) > 0 && (
                  <span className="rounded-pill bg-danger text-primary-foreground text-2xs min-w-5 px-1.5 py-0.5 text-center font-bold tabular-nums">
                    {formatNumber(counts[item.key], locale)}
                  </span>
                )}
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
