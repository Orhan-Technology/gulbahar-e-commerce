import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarClock, Sun } from 'lucide-react';

import { ResumeShopButton } from '@/components/dashboard/resume-shop-button';
import { formatDate } from '@/lib/format';
import { pauseState } from '@/lib/pause';
import { Link } from '@/lib/i18n/navigation';

/**
 * The shop is shut — said once, at the top of every dashboard screen, and it
 * stays said (Prompt: while paused, the dashboard says so prominently and
 * persistently, not as a toast).
 *
 * A toast is exactly wrong for this. Vacation mode is a STATE, not an event: the
 * shopkeeper who set it a week ago needs to be reminded every time they open the
 * panel, and the one who set it by accident needs to find out on the next screen
 * rather than the next order that never arrives. It lives in the layout so no
 * route can forget it.
 *
 * TWO BANNERS, not one with a flag. "You are closed until Thursday" and "your
 * closure ended on Thursday — you are open again" are opposite facts, and the
 * second one is the whole reason `pausedUntil` is a date: a shop that resumed
 * automatically should be told, not left reading a banner that has quietly
 * stopped being true.
 *
 * Renders nothing when the shop is trading and no pause was ever set.
 */
export async function PauseBanner({
  pausedUntil,
  now,
}: {
  pausedUntil: Date | null;
  /** Read on the server and passed down — no clock reads during render. */
  now: Date;
}) {
  const state = pauseState(pausedUntil, now);
  if (!state) return null;

  const locale = await getLocale();
  const t = await getTranslations('shopSettings.vacation');
  const date = formatDate(state.until, locale, 'medium');

  if (state.paused) {
    return (
      <div
        role="status"
        className="border-accent-warm/40 bg-accent-warm/10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5"
      >
        <CalendarClock className="text-accent-warm h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-xs font-medium">
          {t('bannerPaused', { date })}
          <span className="text-muted-foreground block font-normal">{t('bannerPausedBody')}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <ResumeShopButton label={t('resumeNow')} />
          <Link
            href="/dashboard/settings"
            className="text-primary rounded-control px-2 py-1 text-xs font-semibold hover:bg-neutral-100"
          >
            {t('change')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="border-success/30 bg-success-bg flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5"
    >
      <Sun className="text-success h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-xs font-medium">
        {t('bannerOverdue', { date })}
        <span className="text-muted-foreground block font-normal">{t('bannerOverdueBody')}</span>
      </p>
      <ResumeShopButton label={t('confirmOpen')} />
    </div>
  );
}
