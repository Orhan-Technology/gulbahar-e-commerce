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
