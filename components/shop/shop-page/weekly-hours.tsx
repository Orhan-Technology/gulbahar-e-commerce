import { getLocale, getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';

import { formatWeekdayHours } from '@/lib/format';
import { mallDay } from '@/lib/opening';
import { cn } from '@/lib/utils';

/**
 * The whole week, on the shop's About tab (Prompt: per-day opening hours).
 *
 * THE FRIDAY CLOSURE IS THE POINT. `shops.hours` now holds a base range plus
 * per-day overrides, and the About tab was rendering only the base — so a shop
 * that shuts on Friday, which is the actual rhythm of a Kabul mall, looked
 * identical to one that does not. Somebody plans a trip on the strength of that
 * line.
 *
 * TODAY IS MARKED, because that is the row anyone is really looking for. The day
 * is the MALL's (Asia/Kabul, a half-hour offset), not the server's and not the
 * visitor's: the fact being stated is about a building, so a demo laptop in
 * Berlin must highlight the same row as one in Kabul.
 *
 * THE RAW STRING NEVER REACHES THE SCREEN. `08:00-19:00;fri=closed` is a
 * storage format; every value here goes through formatWeekdayHours(), which
 * gives Persian digits in fa and ASCII in en (CLAUDE.md: freezing one
 * language's digits into the column is the bug this format exists to avoid).
 *
 * Renders nothing when the column holds no parseable schedule — a shop with
 * unknown hours is not a shop that is closed, and seven empty rows would say it
 * was.
 */
export async function WeeklyHours({ hours, now }: { hours: string | null; now: Date }) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.hours');
  const tDays = await getTranslations('shopProfile.hoursEditor.days');

  const schedule = formatWeekdayHours(hours, locale);
  if (!schedule) return null;

  const today = mallDay(now);

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <span className="rounded-control bg-primary-50 text-primary-700 flex h-8 w-8 shrink-0 items-center justify-center">
          <Clock className="h-4 w-4" aria-hidden />
        </span>
        {t('title')}
      </h2>

      <ul className="space-y-0.5">
        {schedule.map((row) => {
          const isToday = row.day === today;
          return (
            <li
              key={row.day}
              className={cn(
                'rounded-control flex items-center justify-between gap-3 px-2 py-1.5 text-sm',
                isToday && 'bg-primary-50 font-semibold',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('truncate', !isToday && 'text-neutral-700')}>
                  {tDays(row.day)}
                </span>
                {isToday && (
                  <span className="rounded-pill bg-primary text-primary-foreground text-2xs shrink-0 px-1.5 py-0.5 font-medium">
                    {t('today')}
                  </span>
                )}
              </span>

              {/* A CLOSED day is muted, not red. It is a normal week, not a
                  fault, and seven rows with one alarming entry reads as one. */}
              {row.hours ? (
                <span className="shrink-0 tabular-nums">{row.hours}</span>
              ) : (
                <span className="text-muted-foreground shrink-0">{t('closed')}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
