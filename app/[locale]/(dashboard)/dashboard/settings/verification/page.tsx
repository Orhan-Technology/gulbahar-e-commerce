import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, FileText } from 'lucide-react';

import { UnavailableCard } from '@/components/custom/unavailable-card';
import { ConsolePageHeader } from '@/components/console/page-header';
import { requireShopkeeper } from '@/lib/auth/guards';
import { shopById } from '@/lib/db/queries/shops';
import { formatDate } from '@/lib/format';

/**
 * Shop verification, from the shopkeeper's side (Prompts C5, C7).
 *
 * The setup guide's last step points here, so the page exists as soon as the
 * step does — a checklist row that leads nowhere is worse than a missing row.
 *
 * WHAT IT CLAIMS, stated here because the claim is the whole feature: mall
 * management confirms this is a registered business operating at this unit in
 * Gulbahar Center. That is a claim only a mall can make, and it is why the
 * badge means something a self-service marketplace's cannot.
 *
 * The document UPLOAD is not built yet, and this says so rather than showing a
 * dropzone that discards files (A3's honesty rule). What is real today is the
 * status: a verified shop shows its date, an unverified one shows what it would
 * take.
 */
export default async function VerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopVerification');

  const shop = await shopById(user.shopId);
  const verified = Boolean(shop?.verifiedAt);

  return (
    <div className="max-w-2xl space-y-4 p-4">
      <ConsolePageHeader title={t('title')} description={t('intro')} />

      <section className="rounded-card border-border bg-card border p-4">
        <div className="flex items-start gap-3">
          <span
            className={
              verified
                ? 'rounded-control bg-success-bg text-success flex h-10 w-10 shrink-0 items-center justify-center'
                : 'rounded-control flex h-10 w-10 shrink-0 items-center justify-center bg-neutral-100 text-neutral-500'
            }
          >
            <BadgeCheck className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {verified ? t('statusVerified') : t('statusUnverified')}
            </p>
            <p className="text-muted-foreground text-sm">
              {verified && shop?.verifiedAt
                ? t('verifiedOn', { date: formatDate(shop.verifiedAt, locale) })
                : t('unverifiedBody')}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-card border-border bg-card space-y-2 border p-4">
        <h2 className="text-sm font-bold">{t('documentsHeading')}</h2>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>{t('docLicence')}</li>
          <li>{t('docOwnerId')}</li>
          <li>{t('docUnitAgreement')}</li>
        </ul>
        <p className="text-muted-foreground text-xs">{t('privacyNote')}</p>
      </section>

      <UnavailableCard
        icon={<FileText className="h-5 w-5" />}
        title={t('uploadTitle')}
        body={t('uploadBody')}
        pillLabel={t('comingSoon')}
      />
    </div>
  );
}
