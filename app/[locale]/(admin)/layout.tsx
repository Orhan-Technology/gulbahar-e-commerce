import { getTranslations } from 'next-intl/server';

/**
 * Mall management shell. Phase 7.1 replaces this with the admin sidebar and
 * pending-count badges (PRD §7).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('admin');

  return (
    <div className="min-h-screen">
      <header className="border-b border-foreground/10 px-4 py-3">
        <span className="text-sm font-semibold">{t('heading')}</span>
        <span className="ms-2 text-xs opacity-60">(admin)</span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
