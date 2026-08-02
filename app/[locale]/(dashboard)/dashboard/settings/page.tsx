import { getTranslations, setRequestLocale } from 'next-intl/server';

import {
  LanguagePanel,
  NotificationPreferences,
  StaffPanel,
  VacationPanel,
} from '@/components/dashboard/settings/settings-panels';
import { requireShopkeeper } from '@/lib/auth/guards';
import { shopById, shopStaff } from '@/lib/db/queries/shops';
import { MALL_TIME_ZONE } from '@/lib/opening';
import { pauseState } from '@/lib/pause';

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

  const [staff, shop] = await Promise.all([shopStaff(user.shopId), shopById(user.shopId)]);
  // Whether the CONTROLS render is decided here; whether they WORK is decided in
  // the action, which re-reads the membership row (lib/actions/shop-settings.ts).
  const isOwner = staff.some((member) => member.userId === user.id && member.role === 'owner');

  /*
   * One clock read, here, for the vacation panel — and it is read in the MALL's
   * timezone, because "the earliest day I can reopen" is a fact about a building
   * in Kabul, not about wherever this is running. `en-CA` is the shortest way to
   * get an ISO `YYYY-MM-DD` out of Intl, which is the format a date input wants.
   */
  const now = new Date();
  const pause = pauseState(shop?.pausedUntil ?? null, now);
  const earliest = new Intl.DateTimeFormat('en-CA', { timeZone: MALL_TIME_ZONE }).format(
    new Date(now.getTime() + 86_400_000),
  );

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-base font-bold">{t('title')}</h1>

      <VacationPanel
        pausedUntil={shop?.pausedUntil ? shop.pausedUntil.toISOString() : null}
        paused={pause?.paused ?? false}
        noteFa={shop?.pauseNote?.fa ?? ''}
        noteEn={shop?.pauseNote?.en ?? ''}
        earliest={earliest}
      />

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
