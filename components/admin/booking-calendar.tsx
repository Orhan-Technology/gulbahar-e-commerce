'use client';

import { useLocale, useTranslations } from 'next-intl';

import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type CalendarSlot = {
  slotId: string;
  slotName: string;
  capacity: number;
  weeks: Array<{ weekStart: string; booked: number }>;
};

/**
 * Booking calendar per slot (PRD §7.3).
 *
 * A grid of week cells rather than a real calendar, because placement is sold by
 * the week (PRD §8.3) — a day view would imply a granularity that does not exist.
 * Each cell shows how many of the slot's places are taken that week, so an
 * administrator can answer "can I sell the hero banner in three weeks" at a glance.
 *
 * The grid flows in reading order without any RTL special-casing: it is a flex row,
 * so in Dari the earliest week sits on the right where the eye starts.
 */
export function BookingCalendar({ slots }: { slots: CalendarSlot[] }) {
  const t = useTranslations('adminPromotions.calendar');
  const locale = useLocale();

  if (slots.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('empty')}</p>;
  }

  const weekLabels = slots[0].weeks.map((week) => week.weekStart);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">{t('legend')}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-lg border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="text-muted-foreground text-start font-normal">{t('slot')}</th>
              {weekLabels.map((weekStart) => (
                <th key={weekStart} className="text-muted-foreground font-normal">
                  {formatDate(weekStart, locale, 'short')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.slotId}>
                <th scope="row" className="min-w-32 text-start text-sm font-medium">
                  {slot.slotName}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {t('capacity', { count: formatNumber(slot.capacity, locale) })}
                  </span>
                </th>

                {slot.weeks.map((week) => {
                  const free = Math.max(slot.capacity - week.booked, 0);
                  const full = free === 0;
                  const partial = week.booked > 0 && !full;

                  return (
                    <td key={week.weekStart} className="p-0">
                      <div
                        className={cn(
                          'rounded-control flex h-9 items-center justify-center text-xs font-medium',
                          full && 'bg-danger-bg text-danger',
                          partial && 'bg-warning-bg text-warning',
                          !full && !partial && 'bg-success-bg text-success',
                        )}
                        // A cell is a data point, so the exact numbers go in the
                        // title as well as the glyph.
                        title={t('cellTitle', {
                          slot: slot.slotName,
                          week: formatDate(week.weekStart, locale),
                          booked: formatNumber(week.booked, locale),
                          capacity: formatNumber(slot.capacity, locale),
                        })}
                      >
                        {full
                          ? t('cellFull')
                          : t('cellFree', { count: formatNumber(free, locale) })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
