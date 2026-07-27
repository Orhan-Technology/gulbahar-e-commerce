import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';

import { ProfileForm } from '@/components/dashboard/profile/profile-form';
import { Button } from '@/components/ui/button';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { categoryTree, shopById } from '@/lib/db/queries/shops';
import { Link } from '@/lib/i18n/navigation';

/** Shop profile (PRD §6.6). */
export default async function ShopProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopProfile');

  const [shop, tree] = await Promise.all([shopById(user.shopId), categoryTree(locale)]);
  if (!shop) notFound();

  // A shop sits under a top-level category, not a leaf — a whole shop is
  // "electronics", while a single product is "mobiles".
  const categories = tree.map((root) => ({
    id: root.id,
    label: pickLocale(root.name, locale) ?? root.slug,
  }));

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-bold">{t('title')}</h1>
        {shop.status === 'approved' && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/shops/${shop.slug}`} target="_blank">
              <ExternalLink />
              {t('viewPublicPage')}
            </Link>
          </Button>
        )}
      </div>

      <ProfileForm
        categories={categories}
        initial={{
          nameFa: shop.name.fa ?? '',
          nameEn: shop.name.en ?? '',
          namePs: shop.name.ps ?? '',
          descriptionFa: shop.description?.fa ?? '',
          descriptionEn: shop.description?.en ?? '',
          descriptionPs: shop.description?.ps ?? '',
          categoryId: shop.categoryId,
          floor: shop.floor === null ? '' : String(shop.floor),
          unitNumber: shop.unitNumber ?? '',
          phone: shop.phone ?? '',
          hours: shop.hours ?? '',
          logoPath: shop.logoPath,
          bannerPath: shop.bannerPath,
          status: shop.status,
        }}
      />
    </div>
  );
}
