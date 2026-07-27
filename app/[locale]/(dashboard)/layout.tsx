import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExternalLink, Store } from 'lucide-react';

import { DashboardSidebar, DashboardTabBar } from '@/components/dashboard/dashboard-nav';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { LocaleSwitcher } from '@/components/shop/locale-switcher';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopById } from '@/lib/db/queries/shops';
import { unreadNotificationCount, userNotifications } from '@/lib/db/queries/notifications';
import { Link } from '@/lib/i18n/navigation';

/**
 * Shop panel shell (PRD §6).
 *
 * Mobile-first: tenants run their shop from a phone behind the counter, so the
 * bottom tab bar is the primary navigation and the sidebar is the desktop
 * enhancement — not the other way round.
 *
 * Access control lives here rather than in proxy.ts because the auth config
 * imports the database and proxy.ts runs on the edge runtime.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireShopkeeper(locale);
  const t = await getTranslations('dashboardNav');

  const [shop, notifications, unread] = await Promise.all([
    shopById(user.shopId),
    userNotifications(user.id, user.role, 20),
    unreadNotificationCount(user.id, user.role),
  ]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-border bg-background sticky top-0 z-30 border-b">
        <div className="flex h-14 items-center gap-3 px-4">
          {/* Shop switcher: single shop today, but the shape is future-proofed for
              a tenant running two units in the mall (PRD §6.1). */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-control bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center">
              <Store className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight font-bold">
                {shop ? pickLocale(shop.name, locale) : t('yourShop')}
              </p>
              <p className="text-muted-foreground text-xs">{t('shopPanel')}</p>
            </div>
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-1">
            <Link
              href={shop ? `/shops/${shop.slug}` : '/'}
              className="rounded-control text-muted-foreground hidden items-center gap-1 px-2 py-1.5 text-xs hover:bg-neutral-100 sm:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t('viewStorefront')}
            </Link>
            <LocaleSwitcher />
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

      <div className="flex">
        <DashboardSidebar />
        {/* pb-20 clears the fixed mobile tab bar. */}
        <main className="min-w-0 flex-1 pb-20 md:pb-6">{children}</main>
      </div>

      <DashboardTabBar />
    </div>
  );
}
