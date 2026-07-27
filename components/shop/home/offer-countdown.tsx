'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Timer } from 'lucide-react';

import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Live countdown for flash-style offers (PRD §5.1, §6.4).
 *
 * `endsAt` arrives as an ISO string and only becomes a live ticker after mount.
 * Computing remaining time during render would differ between server and client
 * by the request latency and cause a hydration mismatch, so the first paint shows
 * a static label that both sides agree on.
 */
export function OfferCountdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const locale = useLocale();
  const t = useTranslations('offers');
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    /*
     * The first tick goes through rAF rather than being called directly here:
     * a synchronous setState inside an effect triggers a cascading render, which
     * React 19 flags. rAF fires after the effect has committed.
     */
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);

  const wrapper = cn('inline-flex items-center gap-1 text-xs font-medium tabular-nums', className);

  if (now === null) {
    return (
      <span className={wrapper}>
        <Timer className="h-3 w-3 shrink-0" aria-hidden />
        {t('endingSoon')}
      </span>
    );
  }

  const remaining = new Date(endsAt).getTime() - now;

  if (remaining <= 0) {
    return (
      <span className={wrapper}>
        <Timer className="h-3 w-3 shrink-0" aria-hidden />
        {t('ended')}
      </span>
    );
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => formatNumber(value, locale).padStart(2, formatNumber(0, locale));

  // More than a day out, a clock is noise; show the day count instead.
  if (days > 0) {
    return (
      <span className={wrapper}>
        <Timer className="h-3 w-3 shrink-0" aria-hidden />
        {t('daysLeft', { days: formatNumber(days, locale) })}
      </span>
    );
  }

  return (
    <span className={wrapper}>
      <Timer className="h-3 w-3 shrink-0" aria-hidden />
      {/* A clock reads left-to-right even inside an RTL paragraph. */}
      <span dir="ltr">{`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`}</span>
    </span>
  );
}
