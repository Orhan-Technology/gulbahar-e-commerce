'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompact, formatCurrency, formatDate } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

export type SlotRevenuePoint = { key: string; name: string; revenue: number; occupancy: number };
export type MonthPoint = { month: string; revenue: number };

/**
 * Revenue by slot type (PRD §7.3) — quality-bar screen #4.
 *
 * A horizontal bar chart, not vertical: slot names are long Dari phrases and
 * vertical bars would force them to 45°, which is unreadable in any script. Bars
 * are tinted by OCCUPANCY rather than a single accent colour, so the chart answers
 * two questions at once — which slots earn most, and which are actually selling out.
 *
 * RTL: `reversed` on the value axis makes the bars grow from the right in Dari, and
 * the category axis moves to the right edge, so the whole chart reads in the same
 * direction as the page (PRD §10.3).
 */
export function SlotRevenueChart({ data }: { data: SlotRevenuePoint[] }) {
  const locale = useLocale();
  const t = useTranslations('adminRevenue');
  const isRtl = localeDirection(locale) === 'rtl';

  if (data.every((point) => point.revenue === 0)) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t('noRevenue')}</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: isRtl ? 4 : 12, bottom: 4, left: isRtl ? 12 : 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-neutral-200)"
            horizontal={false}
          />

          <XAxis
            type="number"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            tickFormatter={(value: number) => formatCompact(value, locale)}
          />
          <YAxis
            type="category"
            dataKey="name"
            orientation={isRtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            width={110}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-700)' }}
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
            // Recharts types value as possibly-undefined, so coerce before formatting.
            formatter={(value) =>
              [formatCurrency(Number(value ?? 0), locale), t('slotRevenue')] as [string, string]
            }
          />

          <Bar dataKey="revenue" radius={4} barSize={22}>
            {data.map((point) => (
              <Cell
                key={point.key}
                // Full slots read as success; the rest scale with how full they are.
                fill={
                  point.occupancy >= 1
                    ? 'var(--color-success)'
                    : point.occupancy >= 0.5
                      ? 'var(--color-accent-500)'
                      : 'var(--color-accent-300)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Monthly placement revenue from the seeded history (PRD §9.4).
 *
 * Bars rather than a line: monthly revenue is a set of discrete billed amounts, and
 * a line between them would imply a continuous quantity that does not exist.
 */
export function MonthlyRevenueChart({ data }: { data: MonthPoint[] }) {
  const locale = useLocale();
  const t = useTranslations('adminRevenue');
  const isRtl = localeDirection(locale) === 'rtl';

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" vertical={false} />

          <XAxis
            dataKey="month"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            tickFormatter={(value: string) => formatDate(value, locale, 'short')}
          />
          <YAxis
            orientation={isRtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            tickFormatter={(value: number) => formatCompact(value, locale)}
          />

          <Tooltip
            cursor={{ fill: 'var(--color-neutral-100)' }}
            labelFormatter={(value) => formatDate(String(value), locale)}
            formatter={(value) =>
              [formatCurrency(Number(value ?? 0), locale), t('monthRevenue')] as [string, string]
            }
            contentStyle={{
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-overlay)',
              fontSize: 12,
              direction: isRtl ? 'rtl' : 'ltr',
            }}
          />

          <Bar dataKey="revenue" fill="var(--color-primary-600)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
