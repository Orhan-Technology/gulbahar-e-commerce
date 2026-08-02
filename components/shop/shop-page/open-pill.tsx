import { getLocale, getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';

import { formatClock, formatNumber } from '@/lib/format';
import { CLOSING_SOON_MINUTES, openState } from '@/lib/opening';
import { cn } from '@/lib/utils';

/**
 * OPEN / CLOSED, on the shop hero (Prompt C8).
 *
 * TWO WINDOWS, INTERSECTED. The shop keeps its own hours, but it sits inside a
 * building with a shutter: a shop that opens at 08:00 is not open at 07:30 if
 * the mall does not unlock until 08:00. So the pill reads OPEN only when both
 * are open, and the closing time it names is whichever comes first. The mall's
 * window comes from admin settings, which is what makes the answer editable by
 * the client rather than hard-coded.
 *
 * THREE STATES, not two. "Closing in 40 minutes" is a different piece of advice
 * from "open" — it is the difference between going now and going tomorrow — and
 * it is the state a mall page exists to communicate.
 *
 * Rendered on the SERVER from a `now` passed in, so nothing reads the clock
 * during render (React 19 purity, CLAUDE.md) and no JavaScript is needed for
 * the answer to be right when the page arrives.
 */
export async function OpenPill({
  shopHours,
  mallHours,
  now,
  className,
}: {
  shopHours: string | null;
  mallHours: string;
  now: Date;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shop.openState');
  const tDays = await getTranslations('shopProfile.hoursEditor.days');

  const shop = openState(shopHours, now);
  const mall = openState(mallHours, now);

  // Unknown hours are not closed hours — say nothing rather than turn someone
  // away from a door that is open.
  if (!shop || !mall) return null;

  const open = shop.open && mall.open;
  const minutesLeft = Math.min(shop.minutesUntil, mall.minutesUntil);
  const closingSoon = open && minutesLeft <= CLOSING_SOON_MINUTES;

  const label = open
    ? closingSoon
      ? t('closingSoon', { minutes: formatNumber(minutesLeft, locale) })
      : t('open')
    : t('closed');

  return (
    <span
      data-open={open ? 'true' : 'false'}
      className={cn(
        'rounded-pill shadow-card inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm',
        open
          ? closingSoon
            ? 'bg-accent-warm/95 text-neutral-900'
            : 'bg-success/95 text-white'
          : 'bg-neutral-900/80 text-white',
        className,
      )}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
      {/*
        NAMING THE DAY when the boundary is not today's. `openState` sets
        `nextOpenDay` only when the shop is shut for the whole of the current
        day — the Friday case — and "opens at ۸:۰۰" beside a Friday closure
        reads as "in a couple of hours" to the one person it is meant to stop
        walking over.
      */}
      {!open && (
        <span className="font-normal opacity-80">
          {shop.nextOpenDay
            ? t('opensOnDay', {
                day: tDays(shop.nextOpenDay),
                time: formatClock(shop.boundary, locale),
              })
            : t('opensAt', { time: formatClock(shop.boundary, locale) })}
        </span>
      )}
    </span>
  );
}
