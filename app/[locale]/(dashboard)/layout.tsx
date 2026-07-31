import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExternalLink, Store } from 'lucide-react';

import { DashboardSidebar, DashboardTabBar } from '@/components/dashboard/dashboard-nav';
import { StretchScroll } from '@/components/motion/stretch-scroll';
import { BellSlot } from '@/components/custom/bell-slot';
import { LocaleSwitcher } from '@/components/shop/locale-switcher';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { siteSettings } from '@/lib/db/queries/settings';
import { shopById } from '@/lib/db/queries/shops';
import { shopOrderCounts } from '@/lib/db/queries/shop-orders';
import { shopQuestionCounts } from '@/lib/db/queries/questions';
import { shopReviewCounts } from '@/lib/db/queries/shop-reviews';
import { formatUnitNumber } from '@/lib/format';
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
  const common = await getTranslations('common');

  // The bell fetches its own data now (components/custom/bell-slot.tsx).
  const [shop, orderCounts, settings, questionCounts, reviewCounts] =
    await Promise.all([
      shopById(user.shopId),
      // Feeds the Orders tab badge. Fetched here rather than in the client bar
      // so the count is in the first paint instead of popping in after
      // hydration — the same reason the two counts below it are here.
      shopOrderCounts(user.shopId),
      siteSettings(),
      shopQuestionCounts(user.shopId),
      shopReviewCounts(user.shopId),
    ]);

  // What is actually waiting: orders to accept, questions with no answer,
  // reviews with no reply. Everything else in the rail is a place, not a queue.
  const navCounts = {
    orders: orderCounts.placed,
    questions: questionCounts.pending,
    reviews: reviewCounts.unanswered,
  };

  const shopName = shop ? pickLocale(shop.name, locale) : t('yourShop');

  // Floor, unit and approval state in one line — the shopkeeper's own address in
  // the mall, which is also what a customer sees on the storefront.
  const shopMeta = shop
    ? [
        shop.floor !== null ? common('floorName', { floor: shop.floor }) : null,
        shop.unitNumber ? t('unit', { number: formatUnitNumber(shop.unitNumber, locale) }) : null,
        t(`shopStatus.${shop.status}`),
      ]
        .filter(Boolean)
        .join(' · ')
    : t('shopPanel');

  return (
    <div className="bg-background min-h-screen">
      {/*
        Deep green, not a white bar: this header is the shop's own identity block,
        and on a phone it is the only thing that says WHOSE dashboard this is.
      */}
      <header className="bg-primary-700 text-primary-foreground sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          {/* Shop switcher: single shop today, but the shape is future-proofed for
              a tenant running two units in the mall (PRD §6.1). */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-pill bg-primary-500 flex h-9 w-9 shrink-0 items-center justify-center text-sm font-bold">
              {shopName.trim().charAt(0) || <Store className="h-4 w-4" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight font-bold">{shopName}</p>
              <p className="text-primary-300 truncate text-2xs">{shopMeta}</p>
            </div>
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-1">
            <Link
              href={shop ? `/shops/${shop.slug}` : '/'}
              className="rounded-control text-primary-200 hover:bg-primary-600 hidden items-center gap-1 px-2 py-1.5 text-xs transition-colors duration-150 sm:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t('viewStorefront')}
            </Link>
            <LocaleSwitcher
              className="text-primary-foreground hover:bg-primary-600 hover:text-primary-foreground"
              locales={settings.publishedLocales}
            />
            <BellSlot onDark />
          </div>
        </div>
      </header>

      {/*
        Same rule as the storefront: the shop header above and the tab bar below
        stay outside the stretch, because both are pinned and a transformed
        ancestor un-pins them. See components/motion/stretch-scroll.tsx.
      */}
      <StretchScroll root>
        <div className="flex">
          <DashboardSidebar counts={navCounts} />
          {/* pb-20 clears the fixed mobile tab bar. */}
          <main className="min-w-0 flex-1 pb-20 md:pb-6">{children}</main>
        </div>
      </StretchScroll>

      <DashboardTabBar pendingOrders={orderCounts.placed} />
    </div>
  );
}
