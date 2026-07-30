import { getTranslations, setRequestLocale } from 'next-intl/server';

import { StretchScroll } from '@/components/motion/stretch-scroll';
import { MobileTabBar } from '@/components/shop/mobile-tab-bar';
import { SiteFooter } from '@/components/shop/site-footer';
import { SiteHeader } from '@/components/shop/site-header';
import { currentUser } from '@/lib/auth/guards';
import { getCartCount } from '@/lib/cart';
import { pickLocale } from '@/lib/db/localized';
import { activeOffers } from '@/lib/db/queries/home';
import { siteSettings } from '@/lib/db/queries/settings';
import { categoryTree } from '@/lib/db/queries/shops';

/**
 * Customer storefront shell (PRD §5.1).
 *
 * Header data (cart count, session, category list) is fetched here rather than in
 * each page, so navigating between storefront routes never re-flashes the chrome.
 */
export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, cartCount, tree, live, settings] = await Promise.all([
    currentUser(),
    getCartCount(),
    categoryTree(locale),
    // Lights the header's live badge — see SiteHeader's `liveOffer`. One row,
    // already indexed, and it is the difference between a badge that means
    // something and a badge that is decoration.
    activeOffers(1),
    siteSettings(),
  ]);

  const categories = tree.map((category) => ({
    slug: category.slug,
    label: pickLocale(category.name, locale),
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        cartCount={cartCount}
        user={user ? { name: user.name, role: user.role } : null}
        categories={categories}
        liveOffer={live.length > 0}
        locales={settings.publishedLocales}
      />

      {/*
        Everything that should stretch when the page is over-pulled, and nothing
        that must not.

        The header is a SIBLING on purpose. A transform makes an element the
        containing block for its fixed descendants and shifts its sticky ones,
        so a sticky header inside the wrapper would ride the stretch and a fixed
        tab bar inside it would stop being fixed at all. Both stay outside; the
        footer is inside, because a bounce at the bottom of the document is a
        bounce of the footer — that is the part of the page you are looking at
        when you get there.
      */}
      <StretchScroll root className="flex flex-1 flex-col" contentClassName="flex flex-1 flex-col">
        {/*
          pb-20 on mobile clears the fixed bottom tab bar.

          `overflow-x-clip` contains the product cards' hover pop-out. A card at
          the end of a row scales past the page gutter, and without this the
          document grows a horizontal scrollbar that appears and disappears as
          the pointer moves — the page visibly twitching under the cursor.
          `clip` rather than `hidden` deliberately: `hidden` would make this a
          scroll container and break the header's `position: sticky`.
        */}
        <main className="flex-1 overflow-x-clip pb-20 md:pb-0">{children}</main>

        <SiteFooter />
      </StretchScroll>

      <MobileTabBar />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });
  return { title: { default: t('name'), template: `%s · ${t('shortName')}` } };
}
