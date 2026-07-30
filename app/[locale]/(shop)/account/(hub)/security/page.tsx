import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Lock } from 'lucide-react';

import { SecurityForm } from '@/components/shop/account/security-form';
import { AccountSectionHeader } from '@/components/shop/account/section-header';
import { requireUser } from '@/lib/auth/guards';
import { accountProfile } from '@/lib/db/queries/account';
import { formatPhone } from '@/lib/format';

/**
 * Security — the two credentials, plus the one that cannot be changed (A1/A2).
 *
 * The phone row leads, and it is not an input. The phone number IS the account:
 * it was set at registration, it is the recovery path and the OTP target, and
 * email + password are a faster way IN rather than a second identity. Saying
 * that in one sentence next to a lock is cheaper than answering it later, and a
 * disabled text field would only invite someone to look for how to enable it.
 */
export default async function AccountSecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);
  const profile = await accountProfile(session.id);

  return (
    <div className="space-y-4">
      <AccountSectionHeader
        title={t('sections.security.title')}
        description={t('sections.security.body')}
      />

      <section className="rounded-card border-border bg-card border p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-neutral-100 text-neutral-500">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('panel.phone')}</p>
            <p className="text-sm tabular-nums" dir="ltr">
              {formatPhone(profile?.phone ?? '', locale)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">{t('phoneLocked')}</p>
          </div>
        </div>
      </section>

      <section className="rounded-card border-border bg-card border p-4">
        <SecurityForm
          locale={locale}
          email={profile?.email ?? null}
          emailVerifiedAt={profile?.emailVerifiedAt ?? null}
          hasPassword={Boolean(profile?.hasPassword)}
          passwordUpdatedAt={profile?.passwordUpdatedAt ?? null}
        />
      </section>
    </div>
  );
}
