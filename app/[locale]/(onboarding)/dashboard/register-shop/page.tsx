import { getTranslations, setRequestLocale } from 'next-intl/server';

import { RegisterShopForm } from '@/components/dashboard/register-shop-form';
import { requireUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { categoryTree, shopById, shopForUser } from '@/lib/db/queries/shops';
import { Link } from '@/lib/i18n/navigation';

/** Shop registration and resubmission (PRD §13.1). */
export default async function RegisterShopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const t = await getTranslations('shopRegistration');

  // An existing pending application is amended rather than duplicated.
  const membership = await shopForUser(user.id);
  const existing = membership ? await shopById(membership.shopId) : null;
  const tree = await categoryTree(locale);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">{existing ? t('amendTitle') : t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('intro')}</p>
      </div>

      <RegisterShopForm
        rejectionReason={existing?.rejectionReason ?? null}
        categories={tree.map((root) => ({
          id: root.id,
          label: pickLocale(root.name, locale) ?? root.slug,
        }))}
        initial={{
          nameFa: existing?.name.fa ?? '',
          nameEn: existing?.name.en ?? '',
          descriptionFa: existing?.description?.fa ?? '',
          categoryId: existing?.categoryId ?? null,
          floor:
            existing?.floor === null || existing?.floor === undefined ? '' : String(existing.floor),
          unitNumber: existing?.unitNumber ?? '',
          phone: existing?.phone ?? user.phone ?? '',
          hours: existing?.hours ?? '',
        }}
      />

      <Link href="/" className="text-muted-foreground hover:text-primary text-xs underline">
        {t('backToStore')}
      </Link>
    </div>
  );
}
