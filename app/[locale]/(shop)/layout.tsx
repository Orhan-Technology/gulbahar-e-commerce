import { getTranslations, setRequestLocale } from 'next-intl/server';

/**
 * Customer storefront shell. Phase 5.1 replaces this with the real header,
 * mobile bottom tab bar, and footer (PRD §5.1).
 */
export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Without this, getTranslations() below reads headers and opts the whole
  // route group out of static rendering (Next 16 is stricter than 14 here).
  const { locale } = await params;
  setRequestLocale(locale);

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
