import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CategoryManager } from '@/components/admin/category-manager';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminCategoryTree } from '@/lib/db/queries/admin';

/** Category taxonomy manager (PRD §7.2). */
export default async function AdminCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminCategories');

  const roots = await adminCategoryTree(locale);

  const shape = (node: (typeof roots)[number] | (typeof roots)[number]['children'][number]) => ({
    id: node.id,
    slug: node.slug,
    nameFa: node.name.fa ?? '',
    nameEn: node.name.en ?? '',
    namePs: node.name.ps ?? '',
    label: pickLocale(node.name, locale) ?? node.slug,
    directProductCount: node.directProductCount,
    publicProductCount: node.publicProductCount,
    shopCount: node.shopCount,
    childCount: node.childCount,
  });

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        {/* Admin owns the taxonomy; shops only assign from it (PRD §3.1). */}
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <CategoryManager
        roots={roots.map((root) => ({
          ...shape(root),
          children: root.children.map(shape),
        }))}
      />
    </div>
  );
}
