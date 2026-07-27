import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MobileTabBar } from '@/components/shop/mobile-tab-bar';
import { SiteFooter } from '@/components/shop/site-footer';
import { SiteHeader } from '@/components/shop/site-header';
import { currentUser } from '@/lib/auth/guards';
import { getCartCount } from '@/lib/cart';
import { pickLocale } from '@/lib/db/localized';
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

  const [user, cartCount, tree] = await Promise.all([
    currentUser(),
    getCartCount(),
    categoryTree(locale),
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
      />

      {/* pb-20 on mobile clears the fixed bottom tab bar. */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });
  return { title: { default: t('name'), template: `%s · ${t('shortName')}` } };
}
