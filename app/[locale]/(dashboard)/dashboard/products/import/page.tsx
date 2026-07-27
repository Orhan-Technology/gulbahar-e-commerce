import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { ImportWizard } from '@/components/dashboard/products/import-wizard';
import { requireShopkeeper } from '@/lib/auth/guards';
import { IMPORT_COLUMNS } from '@/lib/import-template';
import { selectableCategories } from '@/lib/db/queries/shop-products';
import { Link } from '@/lib/i18n/navigation';

/** Bulk import wizard (PRD §6.2). */
export default async function ImportProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireShopkeeper(locale);
  const t = await getTranslations('shopProducts');

  /*
   * Sample rows use REAL category slugs from this database, so downloading the
   * template and importing it unchanged succeeds. A template whose own example
   * rows fail validation teaches the wrong thing.
   */
  const categories = await selectableCategories(locale);
  const slug = (index: number) => categories[index % Math.max(categories.length, 1)]?.slug ?? '';

  const sample = [
    `,پیراهن مردانه نمونه,Sample Men's Shirt,توضیح کوتاه,Short description,${slug(0)},1500,1200,10`,
    `,کیف دستی نمونه,Sample Handbag,,,${slug(1)},2400,,4`,
  ];

  return (
    <div className="space-y-4 p-4">
      <nav className="text-muted-foreground flex items-center gap-1 text-xs">
        <Link href="/dashboard/products" className="hover:text-primary">
          {t('title')}
        </Link>
        <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
        <span className="text-foreground">{t('import')}</span>
      </nav>

      <h1 className="text-base font-bold">{t('import')}</h1>

      <ImportWizard template={{ header: IMPORT_COLUMNS.join(','), sample }} />
    </div>
  );
}
