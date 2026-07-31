import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarClock } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { orderTiming, type ReportPeriod } from '@/lib/db/queries/shop-reports';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * When orders arrive (Prompt C10).
 *
 * The answer to a question only a shopkeeper asks: WHEN DOES SOMEBODY NEED TO
 * BE AT THE COUNTER. A heat grid rather than two bar charts, because "Thursday
 * evening" is one cell and not the intersection of two separate readings a
 * reader has to hold in their head.
 *
 * THE WEEK STARTS ON SATURDAY. Afghanistan's working week runs Saturday to
 * Thursday with Friday the day off, and a grid starting on Monday would put the
 * weekend in the middle — the single fastest way to make this screen read as
 * software from somewhere else. Postgres numbers Sunday as 0, so the order is
 * remapped rather than sorted.
 *
 * THE HOUR RANGE COMES FROM THE DATA, not from an assumption about trading
 * hours. A fixed 07:00–20:00 grid looked right and quietly hid the busiest hour
 * in the seed — orders arrive late here, and a heat map whose headline sentence
 * names a column it does not draw is worse than one with a few empty columns.
 * Padded to at least ten columns so a quiet shop's grid still reads as a grid.
 */

/** Saturday first, Friday last (`extract(dow)`: Sunday = 0). */
const WEEKDAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const MIN_COLUMNS = 10;

function hourRange(hours: number[]): number[] {
  if (hours.length === 0) return Array.from({ length: MIN_COLUMNS }, (_, index) => index + 8);

  let low = Math.min(...hours);
  let high = Math.max(...hours);
  while (high - low + 1 < MIN_COLUMNS && (low > 0 || high < 23)) {
    if (low > 0) low -= 1;
    if (high - low + 1 < MIN_COLUMNS && high < 23) high += 1;
  }

  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}

export async function TimingHeatmap({
  shopId,
  period,
}: {
  shopId: string;
  period: ReportPeriod;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopReports.timing');
  const cells = await orderTiming(shopId, period);

  if (cells.length === 0) {
    return (
      <EmptyState
        illustration={<CalendarClock className="h-7 w-7" aria-hidden />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  const HOURS = hourRange(cells.map((cell) => cell.hour));
  const lookup = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.orders]));
  const peak = Math.max(...cells.map((cell) => cell.orders), 1);

  // The busiest cell, named in words — the one sentence a shopkeeper acts on.
  const busiest = cells.reduce((best, cell) => (cell.orders > best.orders ? cell : best), cells[0]);

  return (
    <div className="space-y-4">
      <p className="rounded-card border-primary-200 bg-primary-50 text-primary-900 border p-3 text-sm">
        {t('busiest', {
          day: t(`weekdays.${busiest.weekday}` as never),
          hour: formatNumber(busiest.hour, locale),
          orders: formatNumber(busiest.orders, locale),
        })}
      </p>

      <div className="rounded-card border-border bg-card overflow-hidden border p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-2xs" data-timing-grid>
            <thead>
              <tr>
                <th className="px-2 py-1 text-start font-semibold">{t('day')}</th>
                {HOURS.map((hour) => (
                  <th key={hour} className="px-0.5 py-1 text-center font-normal text-neutral-500">
                    {formatNumber(hour, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAY_ORDER.map((weekday) => (
                <tr key={weekday}>
                  <th className="whitespace-nowrap px-2 py-1 text-start font-medium">
                    {t(`weekdays.${weekday}` as never)}
                  </th>
                  {HOURS.map((hour) => {
                    const orders = lookup.get(`${weekday}-${hour}`) ?? 0;
                    const intensity = orders / peak;
                    return (
                      <td key={hour} className="p-0.5">
                        <span
                          data-timing-cell={orders}
                          title={t('cell', {
                            day: t(`weekdays.${weekday}` as never),
                            hour: formatNumber(hour, locale),
                            orders: formatNumber(orders, locale),
                          })}
                          className={cn(
                            'flex h-7 items-center justify-center rounded-[3px] border tabular-nums',
                            orders === 0
                              ? 'border-neutral-200 bg-neutral-50 text-transparent'
                              : 'border-transparent text-white',
                          )}
                          style={
                            orders === 0
                              ? undefined
                              : {
                                  // One hue, varying weight: a rainbow scale
                                  // would imply categories where there is only
                                  // more and less.
                                  backgroundColor: `color-mix(in oklab, var(--color-primary-600) ${Math.round(
                                    25 + intensity * 75,
                                  )}%, white)`,
                                }
                          }
                        >
                          {orders > 0 ? formatNumber(orders, locale) : '·'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
