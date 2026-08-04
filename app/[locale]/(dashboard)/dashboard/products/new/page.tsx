import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { ProductForm } from '@/components/dashboard/products/product-form';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { defaultProductCategory, selectableCategories } from '@/lib/db/queries/shop-products';
import { Link } from '@/lib/i18n/navigation';

/** New product (PRD §6.2). */
export default async function NewProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopProducts');

  const [categories, defaultCategoryId] = await Promise.all([
    selectableCategories(locale),
    // Where this shop files things — see the query, and the note on the picker.
    defaultProductCategory(user.shopId),
  ]);

  /*
   * Only offered if it is still a real choice: a category the shop used before
   * the mall retired it would otherwise arrive as a value the picker cannot
   * display, which reads as an empty field that will not stay empty.
   */
  const prefill = categories.some((category) => category.id === defaultCategoryId)
    ? defaultCategoryId
    : null;

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
        categoryPrefilled={prefill !== null}
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
          categoryId: prefill,
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
