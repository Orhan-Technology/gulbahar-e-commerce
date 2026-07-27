import { getTranslations } from 'next-intl/server';

/**
 * Shopkeeper panel shell. Phase 6.1 replaces this with the mobile-first
 * bottom tab bar, desktop sidebar, and notification bell (PRD §6).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('dashboard');

  return (
    <div className="min-h-screen">
      <header className="border-b border-foreground/10 px-4 py-3">
        <span className="text-sm font-semibold">{t('heading')}</span>
        <span className="ms-2 text-xs opacity-60">(dashboard)</span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
