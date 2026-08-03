import { getLocale, getTranslations } from 'next-intl/server';

import { formatCurrency, formatDayMonth, formatNumber } from '@/lib/format';

export type ScalePoint = { day: string; revenue: number; orderCount: number };

/**
 * The scale of a trend line, in words (Prompt C12).
 *
 * THE PROBLEM THIS SOLVES. The platform's sales-trend charts have no Y axis and
 * no value labels — a deliberate choice, and a defensible one on a 23rem rail
 * where an axis would eat a fifth of the width — but the consequence was a
 * shape nobody could quote. A mall director looking at the line could not tell
 * whether the peak was fifty thousand afghani or five hundred thousand, and
 * hovering a tooltip is not something anyone does while presenting.
 *
 * So the two endpoints are stated underneath: the best day and the quietest
 * trading day, each with its date and its figure. That is enough to reconstruct
 * the axis by eye, it survives a screenshot, and it is one line of text.
 *
 * ZERO DAYS ARE EXCLUDED FROM THE LOW END. Every zero-filled series has days
 * with nothing in them — a Friday, a gap in the seed — and "the quietest day
 * earned ؋۰" describes the fill, not the business. When every day is zero there
 * is nothing to scale and the note renders nothing at all rather than a row of
 * zeros that look like a bug.
 *
 * A SERVER COMPONENT on purpose: it formats currency and dates, which is work
 * the client half of a chart should never repeat, and it is rendered beside
 * `SalesChart` rather than inside it because that component is shared with the
 * shopkeeper's panel and is not this workstream's to change.
 */
export async function ChartScaleNote({
  data,
  className,
}: {
  data: ScalePoint[];
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('console.chartScale');

  const trading = data.filter((point) => point.revenue > 0);
  if (trading.length === 0) return null;

  const peak = trading.reduce((a, b) => (b.revenue > a.revenue ? b : a), trading[0]);
  const trough = trading.reduce((a, b) => (b.revenue < a.revenue ? b : a), trading[0]);
  const total = data.reduce((sum, point) => sum + point.revenue, 0);
  // A per-day average over the WHOLE window, quiet days included: it is the
  // line's centre of gravity, and dropping the zeros would raise it above the
  // curve the reader is looking at.
  const average = Math.round(total / data.length);

  return (
    <p
      className={`text-2xs flex flex-wrap items-center gap-x-3 gap-y-1 text-neutral-500 ${className ?? ''}`}
      data-chart-scale
    >
      <span>
        {t('peak', {
          date: formatDayMonth(peak.day, locale),
          amount: formatCurrency(peak.revenue, locale),
        })}
      </span>
      <span>
        {t('trough', {
          date: formatDayMonth(trough.day, locale),
          amount: formatCurrency(trough.revenue, locale),
        })}
      </span>
      <span>{t('average', { amount: formatCurrency(average, locale) })}</span>
      <span>
        {t('tradingDays', {
          n: trading.length,
          count: formatNumber(trading.length, locale),
          total: formatNumber(data.length, locale),
        })}
      </span>
    </p>
  );
}
