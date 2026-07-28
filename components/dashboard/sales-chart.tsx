'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { usePrefersReducedMotion } from '@/components/custom/stat-card';
import { formatCurrency, formatDate, formatDayMonth, formatNumber } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

export type SalesPoint = { day: string; revenue: number; orderCount: number };

/**
 * 30-day sales chart (PRD §6.1).
 *
 * Bars rather than an area: daily takings are thirty separate amounts, and the
 * line an area chart draws between them implies a continuous quantity that a
 * shop's till does not have. Bars also survive being 300px wide on a phone,
 * which is where this screen is actually read.
 *
 * There is no Y axis. The 30-day total sits in the panel header and the tooltip
 * carries the exact figure for any day, so an axis of compacted afghanis would
 * spend a fifth of a narrow chart's width restating both. Shading does the
 * ranking instead — the best day is the dark bar.
 *
 * RTL correctness is the remaining difficulty (PRD §10.3): `reversed` on the X
 * axis makes time run right-to-left in Dari, so the most recent day sits where a
 * Dari reader's eye starts. Every tick and tooltip value goes through our Intl
 * formatters, so the chart shows Persian digits and afghanis rather than ASCII
 * numerals. Recharts does none of this on its own.
 */
export function SalesChart({ data }: { data: SalesPoint[] }) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const isRtl = localeDirection(locale) === 'rtl';
  const prefersReduced = usePrefersReducedMotion();

  const peak = Math.max(...data.map((point) => point.revenue), 0);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* Small side margins so the first and last tick labels are not clipped
            by the panel edge — the axis draws them centred on their band. */}
        <BarChart data={data} margin={{ top: 4, right: 14, bottom: 0, left: 14 }}>
          <XAxis
            dataKey="day"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-400)' }}
            // One label per week keeps 30 days legible on a 390px screen.
            interval={6}
            // Day and month only: a full short date is 8 characters and five of
            // them do not fit across a 350px phone chart.
            tickFormatter={(value: string) => formatDayMonth(value, locale)}
          />

          <Tooltip
            cursor={{ fill: 'var(--color-neutral-100)' }}
            contentStyle={{
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-overlay)',
              fontSize: 12,
              direction: isRtl ? 'rtl' : 'ltr',
            }}
            labelFormatter={(value) => formatDate(String(value), locale, 'medium')}
            // Recharts types value as possibly-undefined, so coerce before formatting.
            formatter={(value, name) => {
              const amount = Number(value ?? 0);
              return [
                name === 'revenue' ? formatCurrency(amount, locale) : formatNumber(amount, locale),
                name === 'revenue' ? t('chartRevenue') : t('chartOrders'),
              ] as [string, string];
            }}
          />

          {/*
            Recharts' default grow-in runs 1500ms — five times the motion budget
            (PRD §10.6) — and it restarts on every resize, so a chart can sit at
            zero height for over a second after an orientation change. Capped to
            the same 280ms the stat counters use, and off entirely under reduced
            motion, which Recharts does not check for itself.
          */}
          <Bar
            dataKey="revenue"
            radius={[3, 3, 0, 0]}
            maxBarSize={14}
            isAnimationActive={!prefersReduced}
            animationDuration={280}
          >
            {data.map((point) => (
              <Cell
                key={point.day}
                /*
                 * Three tiers, not a gradient: the best day, the days that came
                 * close, and everything else. A continuous scale would encode
                 * the same information the bar height already carries.
                 */
                fill={
                  peak > 0 && point.revenue >= peak * 0.9
                    ? 'var(--color-primary-700)'
                    : peak > 0 && point.revenue >= peak * 0.7
                      ? 'var(--color-primary-400)'
                      : 'var(--color-primary-200)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
