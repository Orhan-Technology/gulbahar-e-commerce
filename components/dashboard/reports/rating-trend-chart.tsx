'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatDate, formatNumber } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

export type RatingPoint = { week: string; average: number; total: number };

/**
 * Weekly average rating (PRD §6.7).
 *
 * The Y axis is fixed to 1–5 rather than auto-scaled: on an auto axis a drift from
 * 4.6 to 4.4 looks like a collapse, which is a misleading way to show a rating.
 *
 * Same RTL treatment as SalesChart — `reversed` X axis and the Y axis on the right
 * in Dari, so time runs in reading order (PRD §10.3).
 */
export function RatingTrendChart({ data }: { data: RatingPoint[] }) {
  const locale = useLocale();
  const t = useTranslations('shopReports');
  const isRtl = localeDirection(locale) === 'rtl';

  if (data.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t('noReviews')}</p>;
  }

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" vertical={false} />

          <XAxis
            dataKey="week"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            tickFormatter={(value: string) => formatDate(value, locale, 'short')}
          />

          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            orientation={isRtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            width={28}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            tickFormatter={(value: number) => formatNumber(value, locale)}
          />

          <Tooltip
            labelFormatter={(value) => formatDate(String(value), locale)}
            // Recharts types value as possibly-undefined, so coerce before formatting.
            formatter={(value) =>
              [formatNumber(Number(value ?? 0), locale), t('averageRating')] as [string, string]
            }
            contentStyle={{
              borderRadius: 'var(--radius-control)',
              border: '1px solid var(--color-border)',
              fontSize: 12,
            }}
          />

          <Line
            type="monotone"
            dataKey="average"
            stroke="var(--color-primary-600)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-primary-600)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
