'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { formatCurrency, formatDate, formatMonth } from '@/lib/format';
import { localeDirection } from '@/lib/i18n/routing';

export type MonthPoint = { month: string; revenue: number };

/**
 * Twelve months of placement revenue from the seeded history (PRD §7.3, §9.4).
 *
 * Bars rather than a line: monthly revenue is a set of discrete billed amounts,
 * and a line between them would imply a continuous quantity that does not exist.
 * The current month is drawn solid so the eye lands on the figure the tile above
 * is quoting; the eleven behind it are the context for it.
 *
 * THE SCALE IS STATED, IN WORDS, UNDER THE BARS. There is still no Y axis —
 * one would cost a tenth of the chart's width to restate what the tooltip
 * already says exactly — but a chart with neither an axis nor a value label is
 * a shape, not a figure: nobody could tell whether the tallest bar was fifty
 * thousand or five hundred, and nobody could quote it in a meeting without
 * hovering. The best and worst months, named and priced, make the whole series
 * readable at a glance and cost one line. Month labels come from `formatMonth`,
 * which yields the Afghan solar names a Kabul manager reads.
 *
 * RTL: `reversed` makes time run right-to-left in Dari, so the newest month
 * sits at the reading end in both directions (PRD §10.3). Recharts does none of
 * this on its own.
 */
export function MonthlyRevenueChart({ data }: { data: MonthPoint[] }) {
  const locale = useLocale();
  const t = useTranslations('adminRevenue');
  const isRtl = localeDirection(locale) === 'rtl';

  if (data.every((point) => point.revenue === 0)) {
    return <p className="py-8 text-center text-sm text-neutral-500">{t('noRevenue')}</p>;
  }

  const current = data.at(-1)?.month;

  // The endpoints of the scale. Zero months are excluded from the LOW end: "the
  // quietest month earned ؋۰" is true of any series with a gap in it and says
  // nothing about the range the bars are drawn against.
  const earning = data.filter((point) => point.revenue > 0);
  const best = earning.reduce((a, b) => (b.revenue > a.revenue ? b : a), earning[0]);
  const worst = earning.reduce((a, b) => (b.revenue < a.revenue ? b : a), earning[0]);

  return (
    <div className="space-y-2">
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-200)" vertical={false} />

          <XAxis
            dataKey="month"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-neutral-400)' }}
            tickFormatter={(value: string) => formatMonth(value, locale)}
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

          {/* Capped to the 280ms motion budget and skipped under reduced
              motion — see SalesChart for why Recharts' default is a problem. */}
          <Bar
            dataKey="revenue"
            radius={[4, 4, 0, 0]}
            maxBarSize={34}
            // Off for the reason spelled out in ResponsivenessChart.
            isAnimationActive={false}
          >
            {data.map((point) => (
              <Cell
                key={point.month}
                /*
                 * primary-200, not the mockup's paler tint: a quiet month sits
                 * alone among zero-height neighbours here rather than in a
                 * dense run of bars, and at that spacing the paler green is
                 * indistinguishable from the panel behind it.
                 */
                fill={
                  point.month === current
                    ? 'var(--color-primary-700)'
                    : 'var(--color-primary-200)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>

    <p className="text-2xs flex flex-wrap items-center gap-x-3 gap-y-1 text-neutral-500">
      <span>
        {t('chartPeak', {
          month: formatMonth(best.month, locale),
          amount: formatCurrency(best.revenue, locale),
        })}
      </span>
      <span>
        {t('chartTrough', {
          month: formatMonth(worst.month, locale),
          amount: formatCurrency(worst.revenue, locale),
        })}
      </span>
    </p>
    </div>
  );
}
