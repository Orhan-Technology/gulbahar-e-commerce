import type { AppLocale } from './i18n/routing';

/**
 * Locale-aware formatting for money, numbers, and dates (PRD §11).
 *
 * The heavy lifting is done by Intl with Afghan locale tags rather than by a
 * hand-rolled digit map. `fa-AF` already yields Persian-Indic digits, the `٬`
 * group separator, a `؋` currency prefix, and Afghan solar-calendar month names
 * ("۵ اسد ۱۴۰۵") — which is what a Kabul customer expects to read.
 *
 * All monetary amounts are integer afghanis (CLAUDE.md), so fraction digits are
 * always suppressed.
 */

const INTL_LOCALE: Record<AppLocale, string> = {
  fa: 'fa-AF',
  ps: 'ps-AF',
  en: 'en-US',
};

function intlLocale(locale: string): string {
  return INTL_LOCALE[locale as AppLocale] ?? INTL_LOCALE.fa;
}

/** Formats an integer afghani amount, e.g. "؋ ۱٬۲۵۰" / "AFN 1,250". */
export function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'AFN',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Formats a plain number with locale digits and separators. */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/** Compact form for large counts, e.g. "۱٫۲ هزار" / "1.2K". */
export function formatCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact' }).format(value);
}

/**
 * A star rating, e.g. "۴٫۳" / "4.3".
 *
 * One decimal place, always, and rounded before formatting rather than by
 * `maximumFractionDigits`: the same average has to read identically on the
 * product page, the shop card and the shopkeeper's own dashboard, and the way
 * that used to be spelled — `formatNumber(Number(x.toFixed(1)), locale)` —
 * was open-coded at every call site and one of them would eventually differ.
 */
export function formatRating(value: number, locale: string): string {
  return formatNumber(Number(value.toFixed(1)), locale);
}

/** Percentage for discount ribbons, e.g. "٪۲۵" / "25%". */
export function formatPercent(fraction: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(fraction);
}

/**
 * Opening hours, e.g. "۸:۰۰ – ۱۹:۰۰" / "8:00 – 19:00".
 *
 * `shops.hours` is free text, so it is stored CANONICALLY as ASCII "HH:MM-HH:MM"
 * and localised here. Storing the display string instead would freeze one
 * language's digits into the column — which is exactly what the first seed did,
 * leaving English visitors reading Persian numerals.
 *
 * Anything that does not parse is passed through unchanged, so a hand-entered
 * "Fridays only" survives rather than vanishing.
 */
export function formatOpeningHours(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;

  const [, openHour, openMinute, closeHour, closeMinute] = match;
  return `${formatClock(`${openHour}:${openMinute}`, locale)} – ${formatClock(`${closeHour}:${closeMinute}`, locale)}`;
}

/**
 * One clock time, e.g. "۸:۰۰" / "8:00", from canonical ASCII "H:MM".
 *
 * Split out of formatOpeningHours because the OPEN/CLOSED pill names a single
 * boundary ("opens at 08:00") and had no way to render it — the alternative was
 * formatting a fake range and splitting the dash back out, which is the kind of
 * thing that survives until someone changes the separator.
 *
 * The minutes are padded through Intl rather than with String.padStart, so fa
 * gets «۰۰» and not «00».
 */
export function formatClock(value: string, locale: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;

  const [, hour, minute] = match;
  const padded = new Intl.NumberFormat(intlLocale(locale), {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(Number(minute));

  return `${formatNumber(Number(hour), locale)}:${padded}`;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * A phone number, e.g. «۰۷۰۰۰۰۰۰۰۳» / "0700000003" — digit-mapped only, NEVER
 * through formatNumber/Intl.NumberFormat. A phone number is a dialable string,
 * not a quantity: passing one through a number formatter parses it as a JS
 * number first, which drops the leading zero every Afghan mobile number
 * starts with and inserts thousands separators into what should read as one
 * unbroken digit string — "0700000003" became "700,000,003" on the account
 * page (Prompt A1) this way. `ps`, like `fa`, reads Persian digits (PRD §11);
 * only `en` stays Latin.
 */
export function formatPhone(value: string, locale: string): string {
  if (locale === 'en') return value;
  return value.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/**
 * A shop's unit number, e.g. "۲۱۴" / "214".
 *
 * `shops.unit_number` is free text with the same rule as `shops.hours`: stored
 * CANONICALLY in ASCII and localised here. The first seed stored the Dari form
 * directly, which left English visitors reading «۲۱۴» — the identical bug the
 * opening hours had, in a column nobody thought of as numeric.
 *
 * Anything that is not a plain run of digits — "B-12", "کنار پله" — is passed
 * through untouched, because a unit number is a label, not an integer.
 */
export function formatUnitNumber(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? formatNumber(Number(trimmed), locale) : trimmed;
}

/**
 * Joins names the way the locale does: "a, b" in English, «a، b» in Dari.
 *
 * Hard-coding either separator puts the wrong comma in the other language —
 * an ASCII comma reads as a full stop mid-Dari-sentence, and «،» in English
 * looks like a typo. Intl.ListFormat knows both.
 */
export function formatList(items: string[], locale: string): string {
  // `short`, not `narrow`: the narrow style drops the separator entirely in
  // English, turning two shop names into one nonsense name.
  return new Intl.ListFormat(intlLocale(locale), { style: 'short', type: 'unit' }).format(items);
}

/** Day and month alone, for a 30-bar daily axis: "۶/۲۹" / "6/29". */
export function formatDayMonth(date: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Asia/Kabul',
  }).format(new Date(date));
}

/**
 * A date, localised.
 *
 * 'short' is NUMERIC and therefore ambiguous — `en-US` renders 7/1/26, which an
 * Afghan reader parses as the seventh of January (Prompt C2). Use 'medium'
 * anywhere a date is read rather than scanned, which is everywhere a person is
 * being told something. 'short' survives for dense tables where the column has
 * a header saying what it is.
 */
export function formatDate(
  date: Date | string | number,
  locale: string,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: style,
    timeZone: 'Asia/Kabul',
  }).format(new Date(date));
}

/**
 * Month name alone, for a 12-bar axis, e.g. "اسد" / "Aug".
 *
 * A full date under twelve bars is unreadable at any width, and in fa-AF the
 * short date style renders as a numeric "۱۴۰۵/۵/۱" that says nothing a reader
 * can scan. Intl gives the Afghan solar month names here for free.
 */
export function formatMonth(date: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    timeZone: 'Asia/Kabul',
  }).format(new Date(date));
}

/**
 * Month and year, e.g. «سرطان ۱۴۰۵» / "Jun 2026" — for "member since".
 *
 * A full date there is precision nobody asked for: the fact being stated is how
 * long someone has been a customer, and a day number invites the reader to work
 * out an anniversary.
 */
export function formatMonthYear(date: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kabul',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kabul',
  }).format(new Date(date));
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

/**
 * Relative timestamp for the notification log and action queue, e.g.
 * "۳ ساعت پیش" / "3 hours ago". `now` is injectable so seeded data and tests
 * render deterministically.
 */
export function formatRelative(
  date: Date | string | number,
  locale: string,
  now = Date.now(),
): string {
  const diff = new Date(date).getTime() - now;
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return formatter.format(Math.round(diff / 1000), 'second');
}

/**
 * Discount percentage off, for the ProductCard ribbon. Returns null when there
 * is no active discount so callers can skip the ribbon entirely.
 */
export function discountFraction(price: number, discountPrice: number | null): number | null {
  if (discountPrice === null || discountPrice >= price || price <= 0) return null;
  return (price - discountPrice) / price;
}
