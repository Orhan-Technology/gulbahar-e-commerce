import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { ProductForm } from '@/components/dashboard/products/product-form';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { selectableCategories } from '@/lib/db/queries/shop-products';
import { Link } from '@/lib/i18n/navigation';

/** New product (PRD §6.2). */
export default async function NewProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireShopkeeper(locale);
  const t = await getTranslations('shopProducts');

  const categories = await selectableCategories(locale);

  return (
    <div className="space-y-4 p-4">
      <nav className="text-muted-foreground flex items-center gap-1 text-xs">
        <Link href="/dashboard/products" className="hover:text-primary">
          {t('title')}
        </Link>
        <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
        <span className="text-foreground">{t('newProduct')}</span>
      </nav>

      <h1 className="text-base font-bold">{t('newProduct')}</h1>

      <ProductForm
        images={[]}
        categories={categories.map((category) => ({
          id: category.id,
          slug: category.slug,
          label: pickLocale(category.name, locale) ?? category.slug,
          parentLabel: category.parentName ? pickLocale(category.parentName, locale) : null,
        }))}
        initial={{
          titleFa: '',
          titleEn: '',
          titlePs: '',
          descriptionFa: '',
          descriptionEn: '',
          descriptionPs: '',
          categoryId: null,
          price: '',
          discountPrice: '',
          stock: '0',
          status: 'draft',
          unpublishReason: null,
          brand: '',
          model: '',
          specs: [],
          features: [],
          variants: [],
        }}
      />
    </div>
  );
}
