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

/** Percentage for discount ribbons, e.g. "٪۲۵" / "25%". */
export function formatPercent(fraction: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(fraction);
}

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
