import { getTranslations, setRequestLocale } from 'next-intl/server';

import { requireAdmin } from '@/lib/auth/guards';

/**
 * Mall management shell. Phase 7.1 replaces this with the admin sidebar and
 * pending-count badges (PRD §7).
 *
 * Guarded here for the same reason as the dashboard — see that layout.
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
  await requireAdmin(locale);

  const t = await getTranslations('admin');

  return (
    <div className="min-h-screen">
      <header className="border-foreground/10 border-b px-4 py-3">
        <span className="text-sm font-semibold">{t('heading')}</span>
        <span className="ms-2 text-xs opacity-60">(admin)</span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
