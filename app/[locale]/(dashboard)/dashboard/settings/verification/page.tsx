import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, Clock, FileText, ShieldAlert } from 'lucide-react';

import { ConsolePageHeader } from '@/components/console/page-header';
import { VerificationForm } from '@/components/dashboard/verification-form';
import { Badge } from '@/components/ui/badge';
import { requireShopkeeper } from '@/lib/auth/guards';
import { currentVerification } from '@/lib/db/queries/verification';
import { shopById } from '@/lib/db/queries/shops';
import { formatDate } from '@/lib/format';

/**
 * Shop verification, from the shopkeeper's side (Prompts C5, C7).
 *
 * WHAT IT CLAIMS, stated on the page because the claim is the whole feature:
 * mall management confirms this is a registered business operating at this unit
 * in Gulbahar Center. Only a landlord can say that — a self-service marketplace
 * can verify an email address.
 *
 * The page has one job at a time. Before submitting it is a form; while a
 * review is open it is a status, because a second submission on top of an open
 * one hands the admin two sets of papers for one shop; after a rejection it is
 * the reason plus the form again, which is the only state where both belong.
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

  const [shop, verification] = await Promise.all([
    shopById(user.shopId),
    currentVerification(user.shopId),
  ]);

  const verified = Boolean(shop?.verifiedAt);
  const waiting = verification?.status === 'submitted' || verification?.status === 'under_review';
  const rejected = verification?.status === 'rejected';

  return (
    <div className="max-w-2xl space-y-4 p-4">
      <ConsolePageHeader title={t('title')} description={t('intro')} />

      <section className="rounded-card border-border bg-card border p-4">
        <div className="flex items-start gap-3">
          <span
            className={
              verified
                ? 'rounded-control bg-success-bg text-success flex h-10 w-10 shrink-0 items-center justify-center'
                : waiting
                  ? 'rounded-control bg-warning-bg text-warning-fg flex h-10 w-10 shrink-0 items-center justify-center'
                  : 'rounded-control flex h-10 w-10 shrink-0 items-center justify-center bg-neutral-100 text-neutral-500'
            }
          >
            {verified ? (
              <BadgeCheck className="h-5 w-5" aria-hidden />
            ) : waiting ? (
              <Clock className="h-5 w-5" aria-hidden />
            ) : (
              <ShieldAlert className="h-5 w-5" aria-hidden />
            )}
          </span>

          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {verified
                ? t('statusVerified')
                : waiting
                  ? t('statusWaiting')
                  : rejected
                    ? t('statusRejected')
                    : t('statusUnverified')}
            </p>
            <p className="text-muted-foreground text-sm">
              {verified && shop?.verifiedAt
                ? t('verifiedOn', { date: formatDate(shop.verifiedAt, locale) })
                : waiting && verification?.submittedAt
                  ? t('waitingSince', { date: formatDate(verification.submittedAt, locale) })
                  : t('unverifiedBody')}
            </p>

            {/* The reason, verbatim. A rejection a shop cannot act on is a dead
                end, so the admin's own words are shown as written. */}
            {rejected && verification?.reason && (
              <p className="rounded-control bg-danger-bg text-danger mt-2 p-2 text-sm">
                {verification.reason}
              </p>
            )}

            {verified && verification?.expiresAt && (
              <p className="text-muted-foreground mt-1 text-xs">
                {t('expiresOn', { date: formatDate(verification.expiresAt, locale) })}
              </p>
            )}
          </div>
        </div>

        {waiting && verification && verification.documents.length > 0 && (
          <ul className="border-border mt-3 space-y-1 border-t pt-3">
            {verification.documents.map((document) => (
              <li key={document.id} className="flex items-center gap-2 text-xs text-neutral-600">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{document.originalName}</span>
                <Badge variant="secondary">{t(`kinds.${document.kind}` as never)}</Badge>
              </li>
            ))}
          </ul>
        )}
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

      <VerificationForm canSubmit={!waiting && !verified} />
    </div>
  );
}
