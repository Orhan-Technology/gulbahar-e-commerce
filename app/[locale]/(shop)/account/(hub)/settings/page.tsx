import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Bell, MessageSquare } from 'lucide-react';

import { UnavailableCard } from '@/components/custom/unavailable-card';
import { LanguageForm } from '@/components/shop/account/language-form';
import { NotificationPreferences } from '@/components/shop/account/notification-preferences';
import { PaymentMethodsCard } from '@/components/shop/account/payment-methods-card';
import { AccountSectionHeader } from '@/components/shop/account/section-header';
import { requireUser } from '@/lib/auth/guards';
import { accountProfile } from '@/lib/db/queries/account';
import { notificationPreferences } from '@/lib/db/queries/notifications';
import { siteSettings } from '@/lib/db/queries/settings';
import { CUSTOMER_CATEGORIES, MUTABLE_CATEGORIES } from '@/lib/notification-links';

/**
 * Settings — language, and an honest account of the rest (Prompts A2, A3).
 *
 * The language preference is REAL: it writes `users.locale` and navigates into
 * the chosen locale. The per-channel notification toggles are not, and they
 * render as a disabled surface saying why rather than as switches that flip and
 * do nothing. In-app notifications need no toggle at all — the bell is live and
 * always on, so a control to enable it would imply a state that never exists.
 */
export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);
  const [profile, settings, preferences] = await Promise.all([
    accountProfile(session.id),
    siteSettings(),
    notificationPreferences(session.id),
  ]);

  return (
    <div className="space-y-4">
      <AccountSectionHeader
        title={t('sections.settings.title')}
        description={t('sections.settings.body')}
      />

      <section className="rounded-card border-border bg-card border p-4">
        <h2 className="mb-3 text-sm font-bold">{t('settings.languageHeading')}</h2>
        <LanguageForm
          name={profile?.name ?? ''}
          locale={profile?.locale ?? locale}
          locales={settings.publishedLocales}
        />
      </section>

      <section className="rounded-card border-border bg-card border p-4">
        <h2 className="text-sm font-bold">{t('settings.notificationsHeading')}</h2>

        {/* The one notification channel that genuinely works, stated plainly
            rather than dressed as a setting. */}
        <div className="mt-3 flex items-start gap-3">
          <span className="rounded-control bg-success-bg text-success flex h-9 w-9 shrink-0 items-center justify-center">
            <Bell className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('settings.inAppTitle')}</p>
            <p className="text-muted-foreground text-xs">{t('settings.inAppBody')}</p>
          </div>
        </div>

        {/*
          WHICH notifications, now that there is a centre to receive them in
          (Prompt C12). These are real switches on a real column — a muted
          category is never written at all — which is why they sit above the
          channel card rather than inside it: one of these sections works and
          the other is honest about not existing yet.
        */}
        <div className="border-border mt-3 border-t pt-1">
          {/*
            A CUSTOMER'S list, not the full enum (finding #18). `promotions`
            covers decisions on the advertising SLOTS a shop reserved — its own
            hint reads «مخصوص دکان‌داران» — so on a customer's settings screen
            it is a switch that can only mute messages that will never arrive.
            A shopkeeper or admin reading their own account keeps it, because
            for them it is the one that matters.
          */}
          <NotificationPreferences
            preferences={preferences}
            categories={session.role === 'customer' ? CUSTOMER_CATEGORIES : MUTABLE_CATEGORIES}
          />
        </div>

        <UnavailableCard
          className="mt-3"
          icon={<MessageSquare className="h-5 w-5" />}
          title={t('settings.smsTitle')}
          body={t('settings.smsBody')}
          pillLabel={t('comingSoon')}
        />
      </section>

      {/* On a phone the profile panel's rows live here and in Security, so the
          payment answer belongs on both surfaces a thumb can reach. */}
      <PaymentMethodsCard />
    </div>
  );
}
