import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SectionHeader } from '@/components/custom/section-header';
import { formatNumber } from '@/lib/format';
import { pickLocale } from '@/lib/db/localized';
import { categoryTree } from '@/lib/db/queries/shops';
import { Link } from '@/lib/i18n/navigation';

/**
 * Category index (PRD §5.1): every parent with its children, each carrying a live
 * product count so a customer can see where the catalogue actually is.
 */
export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('categories');
  const tree = await categoryTree(locale);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      {tree.map((parent) => (
        <section key={parent.id} className="space-y-3">
          <SectionHeader
            title={pickLocale(parent.name, locale)}
            description={t('productCount', { count: formatNumber(parent.productCount, locale) })}
            href={`/categories/${parent.slug}`}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {parent.children.map((child) => (
              <Link
                key={child.id}
                href={`/categories/${child.slug}`}
                className="rounded-card border-border bg-card shadow-card hover:shadow-overlay border p-4 transition-shadow duration-150"
              >
                <h3 className="text-foreground text-sm font-semibold">
                  {pickLocale(child.name, locale)}
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('productCount', { count: formatNumber(child.productCount, locale) })}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
