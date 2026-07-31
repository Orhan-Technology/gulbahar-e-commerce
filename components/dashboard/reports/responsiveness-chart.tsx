'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatDate, formatNumber } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

export type ResponsivenessPoint = {
  day: string;
  acceptHours: number | null;
  readyHours: number | null;
  mallAcceptHours: number | null;
};

/**
 * Time to accept, plotted against the mall (Prompt C10).
 *
 * THE MALL LINE IS DASHED AND GREY, and that is the whole design. A second
 * solid coloured line reads as a second metric of yours; a dashed neutral one
 * reads as the backdrop you are being measured against — which is what it is.
 *
 * LOWER IS BETTER on this axis, which is the opposite of every other chart in
 * the console, so the legend says so rather than leaving a shopkeeper to work
 * out that their line being on top is bad news.
 *
 * Same RTL treatment as the other charts: `reversed` X axis and the Y axis on
 * the right in Dari, so time runs in reading order (PRD §10.3).
 */
export function ResponsivenessChart({ data }: { data: ResponsivenessPoint[] }) {
  const locale = useLocale();
  const t = useTranslations('shopReports.responsiveness');
  const isRtl = localeDirection(locale) === 'rtl';

  const withData = data.filter((point) => point.acceptHours !== null);
  if (withData.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t('noData')}</p>;
  }

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" vertical={false} />

          <XAxis
            dataKey="day"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            // A ninety-day window is ninety labels; without a gap they overlap
            // into a grey smear and the axis stops being readable at all.
            interval="preserveStartEnd"
            minTickGap={48}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            tickFormatter={(value: string) => formatDate(value, locale, 'short')}
          />

          <YAxis
            orientation={isRtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            width={36}
            // Whole hours only. Without it recharts picks 0/1.5/2/2.5/3 and the
            // formatter rounds them into a duplicated "۲, ۲" on the axis.
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            tickFormatter={(value: number) => formatNumber(Math.round(value), locale)}
          />

          <Tooltip
            labelFormatter={(value) => formatDate(String(value), locale)}
            formatter={(value, name) =>
              [
                t('hours', { hours: formatNumber(Math.round(Number(value ?? 0)), locale) }),
                String(name),
              ] as [string, string]
            }
            contentStyle={{
              borderRadius: 'var(--radius-control)',
              border: '1px solid var(--color-border)',
              fontSize: 12,
            }}
          />

          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span className="text-neutral-600">{value}</span>}
          />

          <Line
            type="monotone"
            dataKey="acceptHours"
            name={t('yours')}
            stroke="var(--color-primary-600)"
            strokeWidth={2}
            connectNulls
            dot={false}
            /*
             * ENTRANCE ANIMATION OFF, everywhere in the console.
             *
             * Recharts draws a line or area by animating `stroke-dasharray`
             * over 1.5s by default, and it advances on requestAnimationFrame.
             * When rAF is throttled — a background tab, a headless browser, a
             * slow machine mid-demo — the animation stalls PART WAY and the
             * chart renders as a blank plot area with axes. It fails open, and
             * the failure looks exactly like "we have no data".
             *
             * `isAnimationActive={!prefersReduced}` was not enough: the hook
             * reports its answer after first paint, so the animation has
             * already started and freezes where it was. The data is the point;
             * a draw-on that can hide it is not worth keeping (and CLAUDE.md
             * budgets motion at 300ms anyway).
             */
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mallAcceptHours"
            name={t('mallAverage')}
            stroke="var(--color-neutral-400)"
            strokeWidth={2}
            strokeDasharray="5 4"
            connectNulls
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
