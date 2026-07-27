import { getTranslations, setRequestLocale } from 'next-intl/server';

import {
  LanguagePanel,
  NotificationPreferences,
  StaffPanel,
} from '@/components/dashboard/settings/settings-panels';
import { requireShopkeeper } from '@/lib/auth/guards';
import { shopStaff } from '@/lib/db/queries/shops';

/** Shop settings (PRD §6.8). */
export default async function ShopSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopSettings');

  const staff = await shopStaff(user.shopId);
  // Whether the CONTROLS render is decided here; whether they WORK is decided in
  // the action, which re-reads the membership row (lib/actions/shop-settings.ts).
  const isOwner = staff.some((member) => member.userId === user.id && member.role === 'owner');

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-base font-bold">{t('title')}</h1>

      <NotificationPreferences />

      <StaffPanel
        canManage={isOwner}
        staff={staff.map((member) => ({
          userId: member.userId,
          name: member.name,
          phone: member.phone,
          role: member.role,
          isSelf: member.userId === user.id,
        }))}
      />

      <LanguagePanel current={user.locale} />
    </div>
  );
}
