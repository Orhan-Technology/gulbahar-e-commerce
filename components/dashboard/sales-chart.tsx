'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompact, formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

export type SalesPoint = { day: string; revenue: number; orderCount: number };

/**
 * 30-day sales chart (PRD §6.1).
 *
 * RTL correctness is the whole difficulty here (PRD §10.3):
 *   - `reversed` on the X axis makes time run right-to-left in Dari, so the most
 *     recent day sits where a Dari reader's eye starts.
 *   - the Y axis moves to the right edge, since that is the leading edge in RTL.
 *   - every tick and tooltip value goes through our Intl formatters, so the chart
 *     shows Persian digits and afghanis rather than ASCII numerals.
 *
 * Recharts does none of this on its own; a default chart reads backwards in Dari.
 */
export function SalesChart({ data }: { data: SalesPoint[] }) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const isRtl = localeDirection(locale) === 'rtl';

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" vertical={false} />

          <XAxis
            dataKey="day"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-500)' }}
            // One label per week keeps 30 days legible on a 390px screen.
            interval={6}
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

          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-primary-600)"
            strokeWidth={2}
            fill="url(#salesFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
