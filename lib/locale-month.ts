/**
 * Month boundaries in the CALENDAR THE READER USES (Prompt C9).
 *
 * `fa-AF` renders dates in the Afghan solar calendar — "۵ اسد ۱۴۰۵" — which is
 * what every date on this product already shows. A month grid built on
 * Gregorian boundaries therefore reads as broken to the only audience it has:
 * the header says Saratan, the columns run 1 to 31 of July, and the two describe
 * different fortnights. Nothing about that is fixable with a nicer label.
 *
 * So the grid is built on the reader's own month. `Intl` can FORMAT into a
 * calendar but cannot parse out of one, so the day-of-month is read back from a
 * formatted date and used to step to the first of that month — which is exact,
 * because it asks the same engine that will render the header.
 *
 * Everything returned is a UTC instant. The column keys stay ISO dates, so the
 * SQL that fills them needs to know nothing about calendars at all.
 */

const INTL_LOCALE: Record<string, string> = {
  fa: 'fa-AF',
  ps: 'ps-AF',
  en: 'en-US',
};

const DAY_MS = 86_400_000;

function calendarLocale(locale: string): string {
  return INTL_LOCALE[locale] ?? INTL_LOCALE.fa;
}

/** The day-of-month this instant falls on, in the reader's calendar. */
export function localeDayOfMonth(date: Date, locale: string): number {
  const parts = new Intl.DateTimeFormat(calendarLocale(locale), {
    timeZone: 'UTC',
    day: 'numeric',
    numberingSystem: 'latn',
  }).formatToParts(date);

  return Number(parts.find((part) => part.type === 'day')?.value ?? '1');
}

/** Midnight UTC on the first day of the month this instant falls in. */
export function startOfLocaleMonth(date: Date, locale: string): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = localeDayOfMonth(new Date(midnight), locale);
  return new Date(midnight - (day - 1) * DAY_MS);
}

/**
 * The first day of the NEXT month.
 *
 * Stepping 32 days forward and re-normalising works for any month length in any
 * calendar — the solar Hijri year has 31-day months, and hard-coding 30 or
 * calling `setMonth` would quietly drop or duplicate a day at every boundary.
 */
export function startOfNextLocaleMonth(monthStart: Date, locale: string): Date {
  return startOfLocaleMonth(new Date(monthStart.getTime() + 32 * DAY_MS), locale);
}

/** The first day of the previous month. */
export function startOfPreviousLocaleMonth(monthStart: Date, locale: string): Date {
  return startOfLocaleMonth(new Date(monthStart.getTime() - DAY_MS), locale);
}

/**
 * The URL key for a month: the ISO DATE of its first day, not `YYYY-MM`.
 *
 * A `YYYY-MM` key names a Gregorian month, which is the thing this module
 * exists to stop assuming — and a link built in Dari would then land an English
 * reader on a different fortnight.
 */
export function monthKey(monthStart: Date): string {
  return monthStart.toISOString().slice(0, 10);
}

export function parseMonthKey(value: string | undefined, locale: string, now: Date): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return startOfLocaleMonth(parsed, locale);
  }
  return startOfLocaleMonth(now, locale);
}

/**
 * THE MONEY MONTH — the current month, and the stretch of the previous one that
 * matches it, in the calendar the reader is looking at.
 *
 * WHY THIS EXISTS. Every ad-revenue figure in the console was computed with
 * `date_trunc('month', now())`, which is the GREGORIAN month, while every label
 * around it is Afghan solar («اسد», «سنبله»). On the 4th of August the SQL said
 * "this month began three days ago" and the chart beside it said "اسد", which
 * began a fortnight earlier — so the overview and /admin/revenue each showed
 * «۰ ؋ ↓۱۰۰٪» directly above their own non-zero اسد bar. The same page
 * contradicting itself, on the number the console exists to sell.
 *
 * The booking calendar already solved this for the grid (see `parseMonthKey`);
 * this is the same basis, given to the money. One helper, so the boundary
 * cannot drift between the two.
 *
 * The clock is read by the CALLER and passed in: a component may not call
 * `new Date()` during render (React 19 purity, CLAUDE.md), so the page reads it
 * once on the server and everything downstream shares that instant.
 */
export type LocaleMonthBounds = {
  /** Midnight UTC on the first day of the reader's current month. */
  start: Date;
  /** Midnight UTC on the first day of the NEXT month — exclusive upper bound. */
  end: Date;
  /** First day of the previous month. */
  previousStart: Date;
  /**
   * The same elapsed stretch, measured from the previous month's own first day.
   *
   * This is what makes the delta honest: month-to-date against a WHOLE previous
   * month is one day of trading against thirty, which is how the tile came to
   * read −۱۰۰٪ every month for the first week of it.
   */
  previousEnd: Date;
  /** Day-of-month `now` falls on, in the reader's calendar. */
  dayOfMonth: number;
  /** Length of the reader's current month — 29, 30 or 31 in solar Hijri. */
  daysInMonth: number;
  /** False on the last day of a month, where month-to-date IS the month. */
  partial: boolean;
};

export function localeMonthBounds(locale: string, now: Date): LocaleMonthBounds {
  const start = startOfLocaleMonth(now, locale);
  const end = startOfNextLocaleMonth(start, locale);
  const previousStart = startOfPreviousLocaleMonth(start, locale);

  const dayOfMonth = localeDayOfMonth(now, locale);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY_MS);

  return {
    start,
    end,
    previousStart,
    previousEnd: new Date(previousStart.getTime() + (now.getTime() - start.getTime())),
    dayOfMonth,
    daysInMonth,
    partial: dayOfMonth < daysInMonth,
  };
}
