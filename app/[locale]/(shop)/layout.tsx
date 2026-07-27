import { getTranslations } from 'next-intl/server';

/**
 * Customer storefront shell. Phase 5.1 replaces this with the real header,
 * mobile bottom tab bar, and footer (PRD §5.1).
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('brand');

  return (
    <div className="min-h-screen">
      <header className="border-b border-foreground/10 px-4 py-3">
        <span className="text-sm font-semibold">{t('shortName')}</span>
        <span className="ms-2 text-xs opacity-60">(shop)</span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
