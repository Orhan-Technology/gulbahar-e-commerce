import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExternalLink, ShieldCheck } from 'lucide-react';

import { AdminNav } from '@/components/admin/admin-nav';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { LocaleSwitcher } from '@/components/shop/locale-switcher';
import { requireAdmin } from '@/lib/auth/guards';
import { adminPendingCounts } from '@/lib/db/queries/admin';
import { siteSettings } from '@/lib/db/queries/settings';
import { unreadNotificationCount, userNotifications } from '@/lib/db/queries/notifications';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * Mall management shell (PRD §7).
 *
 * Desktop-oriented, the mirror image of the shop dashboard: the sidebar is primary
 * and there is no bottom tab bar, because this surface is used at a desk.
 *
 * Access control lives here rather than in proxy.ts because the auth config imports
 * the database and proxy.ts runs on the edge runtime.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Admin role required; a signed-in non-admin is sent to the storefront.
  const user = await requireAdmin(locale);
  const t = await getTranslations('adminNav');

  const [counts, notifications, unread, settings] = await Promise.all([
    adminPendingCounts(),
    userNotifications(user.id, user.role, 20),
    unreadNotificationCount(user.id, user.role),
    siteSettings(),
  ]);

  // Formatted here so the nav needs no locale of its own; null hides the badge.
  const badge = (value: number) => (value > 0 ? formatNumber(value, locale) : null);

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-background sticky top-0 z-30 border-b">
        <div className="flex h-14 items-center gap-3 px-4">
          {/* The rail carries the brand from lg up; below that it is a scroller
              with no room for it, so the header takes over. */}
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <span className="rounded-control bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight font-bold">{t('brand')}</p>
              <p className="text-muted-foreground text-xs">{t('subtitle')}</p>
            </div>
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-1">
            <Link
              href="/"
              className="rounded-control text-muted-foreground hidden items-center gap-1 px-2 py-1.5 text-xs hover:bg-neutral-100 sm:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t('viewStorefront')}
            </Link>
            <LocaleSwitcher locales={settings.publishedLocales} />
            <NotificationBell
              unreadCount={unread}
              notifications={notifications.map((item) => ({
                id: item.id,
                title: item.title,
                body: item.body,
                read: item.read,
                createdAt: item.createdAt.toISOString(),
              }))}
            />
          </div>
        </div>
      </header>

      <div className="lg:flex">
        <AdminNav
          counts={{
            shops: badge(counts.pendingShops),
            reviews: badge(counts.reportedReviews),
            promotions: badge(counts.requestedCampaigns),
            orders: badge(counts.placedOrders),
          }}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
