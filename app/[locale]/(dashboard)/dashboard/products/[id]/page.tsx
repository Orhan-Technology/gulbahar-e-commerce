import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, ExternalLink } from 'lucide-react';

import { ProductForm } from '@/components/dashboard/products/product-form';
import { Button } from '@/components/ui/button';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { selectableCategories, shopProductForEdit } from '@/lib/db/queries/shop-products';
import { Link } from '@/lib/i18n/navigation';

/** Edit product (PRD §6.2). */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopProducts');

  // Scoped by shopId inside the query, so another shop's id is simply not found.
  const [product, categories] = await Promise.all([
    shopProductForEdit(user.shopId, id),
    selectableCategories(locale),
  ]);
  if (!product) notFound();

  return (
    <div className="space-y-4 p-4">
      <nav className="text-muted-foreground flex items-center gap-1 text-xs">
        <Link href="/dashboard/products" className="hover:text-primary">
          {t('title')}
        </Link>
        <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
        <span className="clamp-1 text-foreground">{pickLocale(product.title, locale)}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-bold">{t('editProduct')}</h1>
        {/* Straight to the customer-facing page, so a shopkeeper can check their
            own work the way a buyer sees it. */}
        {product.status === 'published' && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/products/${product.slug}`} target="_blank">
              <ExternalLink />
              {t('viewOnStore')}
            </Link>
          </Button>
        )}
      </div>

      <ProductForm
        images={product.images.map((image) => ({ id: image.id, path: image.path }))}
        categories={categories.map((category) => ({
          id: category.id,
          label: pickLocale(category.name, locale) ?? category.slug,
          parentLabel: category.parentName ? pickLocale(category.parentName, locale) : null,
        }))}
        initial={{
          id: product.id,
          titleFa: product.title.fa ?? '',
          titleEn: product.title.en ?? '',
          titlePs: product.title.ps ?? '',
          descriptionFa: product.description?.fa ?? '',
          descriptionEn: product.description?.en ?? '',
          descriptionPs: product.description?.ps ?? '',
          categoryId: product.categoryId,
          price: String(product.price),
          discountPrice: product.discountPrice ? String(product.discountPrice) : '',
          stock: String(product.stock),
          status: product.status,
          variants: product.variants.map((variant) => ({
            nameFa: variant.name.fa ?? '',
            nameEn: variant.name.en ?? '',
            options: variant.options.map((option) => ({
              fa: option.fa ?? '',
              en: option.en ?? '',
            })),
          })),
        }}
      />
    </div>
  );
}
