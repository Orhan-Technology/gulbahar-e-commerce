'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { usePrefersReducedMotion } from '@/components/custom/stat-card';
import { formatCurrency, formatDate, formatDayMonth, formatNumber } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

export type SalesPoint = { day: string; revenue: number; orderCount: number };

/**
 * 30-day sales chart (PRD §6.1).
 *
 * A 2px LINE OVER A SOFT FILL, not the bars this used to draw. The argument for
 * bars was that daily takings are thirty discrete amounts and a line implies a
 * continuity a till does not have — true, and beside the point at this size. At
 * 30 points on a 350px phone the bars are 4px wide with 2px gaps, which reads as
 * texture rather than as data; the line states the SHAPE of the month, which is
 * the only thing anyone reads a 30-day chart for. The exact figure for any day
 * is a tap away in the tooltip, where it was already.
 *
 * There is still no Y axis. The 30-day total sits in the panel header and the
 * tooltip carries the day's figure, so an axis of compacted afghanis would
 * spend a fifth of a narrow chart's width restating both.
 *
 * RTL correctness is the remaining difficulty (PRD §10.3): `reversed` on the X
 * axis makes time run right-to-left in Dari, so the most recent day sits where a
 * Dari reader's eye starts. Every tick and tooltip value goes through our Intl
 * formatters, so the chart shows Persian digits, afghanis and Afghan solar month
 * names. Recharts does none of this on its own.
 */
export function SalesChart({ data }: { data: SalesPoint[] }) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const isRtl = localeDirection(locale) === 'rtl';
  const prefersReduced = usePrefersReducedMotion();

  // SVG gradient ids are document-global; two charts on one screen would
  // otherwise share — and fight over — a single <linearGradient>.
  const fillId = `sales-fill-${React.useId().replace(/:/g, '')}`;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* Small side margins so the first and last tick labels are not clipped
            by the panel edge — the axis draws them centred on their band. */}
        <AreaChart data={data} margin={{ top: 6, right: 14, bottom: 0, left: 14 }}>
          <defs>
            {/*
              Vertical, so it needs no direction handling: the fill fades from
              the line downward in both scripts. It carries no information the
              line does not — its job is to give the curve weight against a
              white panel without drawing a second edge.
            */}
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-600)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-primary-600)" stopOpacity={0} />
            </linearGradient>
          </defs>

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
            cursor={{ stroke: 'var(--color-neutral-300)', strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-overlay)',
              fontSize: 12,
              direction: isRtl ? 'rtl' : 'ltr',
            }}
            // The same medium date the rest of the app prints, which in fa-AF is
            // the Afghan solar calendar and in en the Gregorian one — one
            // formatter, so a date cannot read differently here than anywhere else.
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
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-primary-600)"
            strokeWidth={2}
            fill={`url(#${fillId})`}
            // No resting dots: thirty of them on a phone is a dotted line, not a
            // set of points. The hovered day gets one, which is when it means
            // something.
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: 'var(--color-background)',
              fill: 'var(--color-primary-600)',
            }}
            isAnimationActive={!prefersReduced}
            animationDuration={280}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
