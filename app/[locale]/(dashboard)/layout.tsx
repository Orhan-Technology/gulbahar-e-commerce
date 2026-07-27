import { getTranslations, setRequestLocale } from 'next-intl/server';

import { requireShopkeeper } from '@/lib/auth/guards';

/**
 * Shopkeeper panel shell. Phase 6.1 replaces this with the mobile-first
 * bottom tab bar, desktop sidebar, and notification bell (PRD §6).
 *
 * Access control lives here rather than in proxy.ts: the auth config imports the
 * database, and proxy.ts runs on the edge runtime. Guarding in the layout also
 * covers every nested route without each page repeating the check.
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

  // Requires a shopkeeper (or admin) WITH a shop; redirects preserve the locale.
  const user = await requireShopkeeper(locale);

  const t = await getTranslations('dashboard');
  void user;

  return (
    <div className="min-h-screen">
      <header className="border-foreground/10 border-b px-4 py-3">
        <span className="text-sm font-semibold">{t('heading')}</span>
        <span className="ms-2 text-xs opacity-60">(dashboard)</span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
