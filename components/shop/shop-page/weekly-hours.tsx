import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronDown, Clock } from 'lucide-react';

import { formatWeekdayHours } from '@/lib/format';
import { mallDay } from '@/lib/opening';
import type { DayKey } from '@/lib/opening';
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
 * BUT SEVEN IDENTICAL ROWS ARE ONE FACT WRITTEN SEVEN TIMES. Most tenants keep
 * the same hours every day, and the panel spent a third of the About tab
 * repeating «۹:۰۰ – ۲۰:۰۰» down a column — a table the reader has to scan to
 * discover that there is nothing to scan for. So consecutive days sharing a
 * range are COLLAPSED into one row («شنبه تا پنجشنبه»), and a shop whose whole
 * week is identical says «همه‌روزه» in a single line. A shop with real variation
 * still shows it, because the grouping is derived from the data rather than
 * assumed.
 *
 * THE FULL WEEK IS ONE TAP AWAY, in a `<details>` — no client component, works
 * before hydration and with JavaScript off, and the platform gives the
 * disclosure semantics for free.
 *
 * TODAY IS MARKED IN BOTH VIEWS, because that is the row anyone is really
 * looking for; on the summary the badge lands on whichever group contains
 * today. The day is the MALL's (Asia/Kabul, a half-hour offset), not the
 * server's and not the visitor's: the fact being stated is about a building, so
 * a demo laptop in Berlin must highlight the same row as one in Kabul.
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

  /*
   * Runs of CONSECUTIVE days with the same hours. Consecutive rather than
   * merely equal: «شنبه تا پنجشنبه» is a week a reader can hold in their head,
   * whereas "Saturday, Monday and Wednesday" grouped away from Sunday would be
   * a puzzle. The schedule already arrives Saturday-first.
   */
  const groups: Array<{ days: DayKey[]; hours: string | null }> = [];
  for (const row of schedule) {
    const last = groups.at(-1);
    if (last && last.hours === row.hours) last.days.push(row.day);
    else groups.push({ days: [row.day], hours: row.hours });
  }

  const uniform = groups.length === 1;

  const value = (hoursText: string | null) =>
    hoursText ? (
      <span className="shrink-0 tabular-nums">{hoursText}</span>
    ) : (
      /* A CLOSED day is muted, not red. It is a normal week, not a fault, and
         seven rows with one alarming entry reads as one. */
      <span className="text-muted-foreground shrink-0">{t('closed')}</span>
    );

  const todayBadge = (
    <span className="rounded-pill bg-primary text-primary-foreground text-2xs shrink-0 px-1.5 py-0.5 font-medium">
      {t('today')}
    </span>
  );

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <span className="rounded-control bg-primary-50 text-primary-700 flex h-8 w-8 shrink-0 items-center justify-center">
          <Clock className="h-4 w-4" aria-hidden />
        </span>
        {t('title')}
      </h2>

      <ul className="space-y-0.5">
        {groups.map((group) => {
          const holdsToday = group.days.includes(today);
          const label = uniform
            ? t('everyDay')
            : group.days.length === 1
              ? tDays(group.days[0])
              : t('dayRange', {
                  from: tDays(group.days[0]),
                  to: tDays(group.days[group.days.length - 1]),
                });

          return (
            <li
              key={group.days[0]}
              className={cn(
                'rounded-control flex items-center justify-between gap-3 px-2 py-1.5 text-sm',
                holdsToday && 'bg-primary-50 font-semibold',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('truncate', !holdsToday && 'text-neutral-700')}>{label}</span>
                {holdsToday && todayBadge}
              </span>
              {value(group.hours)}
            </li>
          );
        })}
      </ul>

      {/*
        Only when the summary is actually a summary. On a shop whose seven rows
        are seven different ranges the groups ARE the week, and a disclosure
        that reveals an identical list is a control that does nothing.
      */}
      {groups.length < schedule.length && (
        <details className="group">
          {/* `list-none` alone leaves Safari's disclosure triangle, which is a
              separate pseudo-element — both are needed to own the affordance. */}
          <summary className="text-primary hover:text-primary-800 inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold transition-colors duration-150 [&::-webkit-details-marker]:hidden">
            {t('showEveryDay')}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-180"
              aria-hidden
            />
          </summary>

          <ul className="mt-2 space-y-0.5">
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
                    {isToday && todayBadge}
                  </span>
                  {value(row.hours)}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
