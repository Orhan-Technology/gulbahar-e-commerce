'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { formatNumber } from '@/lib/format';

export type StatusSlice = { status: string; total: number };

/**
 * Order status mix (PRD §6.7).
 *
 * A donut rather than a pie so the total sits in the middle, which is the number a
 * shopkeeper actually wants; the slices answer the follow-up question.
 *
 * Colours come from the semantic tokens, so the same status reads the same here as
 * on a badge elsewhere in the panel. Recharts needs concrete colour values, so
 * these are `var(--color-*)` references rather than Tailwind classes.
 */
const COLOURS: Record<string, string> = {
  placed: 'var(--color-warning)',
  /*
   * Accepted and ready were two steps of one blue — `primary-500` beside
   * `primary-700` — which at donut-slice size read as the same colour twice.
   * Accepted keeps the lighter tint the order badges now use, and ready moves
   * to the accent so the two stages separate at a glance. The pairing has to
   * match the badges on the orders list, or the same word means a different
   * colour on two screens of one console.
   */
  accepted: 'var(--color-primary-200)',
  ready: 'var(--color-primary-700)',
  fulfilled: 'var(--color-success)',
  rejected: 'var(--color-danger)',
  /*
   * Muted rather than red. A rejection is the shop refusing at the door and
   * belongs beside the other things that went wrong; a cancellation is often
   * the customer changing their mind, and colouring it as a failure would put
   * the shop's own dashboard in the business of blaming them for it.
   *
   * Deliberately typed Record<string, string> rather than Record<OrderStatus,
   * string>, which is why the missing key was silent: a cancelled slice
   * rendered with no colour at all until this line existed.
   */
  cancelled: 'var(--color-muted-foreground)',
};

export function StatusDonut({ data }: { data: StatusSlice[] }) {
  const locale = useLocale();
  const t = useTranslations('shopReports');
  const statusLabels = useTranslations('shopOrders.status');

  const total = data.reduce((sum, slice) => sum + slice.total, 0);

  /*
   * THIS RING COUNTS MORE THAN THE STRIP ABOVE IT, AND SAYS SO.
   *
   * The summary strip counts every order the shop did not reject or cancel —
   * that is the platform-wide definition of "orders" and it is printed under
   * the strip. This donut is a breakdown BY STATUS, so it has to include the
   * two statuses that definition excludes, or the rejected and cancelled slices
   * would have nothing to be slices of. The consequence was «۲۲ سفارش» in the
   * middle of a ring sitting directly under a cell reading «۱۹» — the same
   * "three totals for one month" failure the tiles were removed for, moved down
   * one section. Nothing about the arithmetic was wrong; the screen simply
   * never said which of the two numbers answered which question.
   */
  const excluded = data
    .filter((slice) => slice.status === 'rejected' || slice.status === 'cancelled')
    .reduce((sum, slice) => sum + slice.total, 0);

  if (total === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t('noOrders')}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="status"
                innerRadius={46}
                outerRadius={68}
                paddingAngle={2}
                // Anticlockwise from the top in RTL would be wrong for both; a donut
                // has no reading direction, so the default start angle stays.
                stroke="none"
              >
                {data.map((slice) => (
                  <Cell
                    key={slice.status}
                    fill={COLOURS[slice.status] ?? 'var(--color-neutral-300)'}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) =>
                  [
                    formatNumber(Number(value ?? 0), locale),
                    statusLabels(String(name) as 'placed'),
                  ] as [string, string]
                }
                contentStyle={{
                  borderRadius: 'var(--radius-control)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* The total, centred inside the ring. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold">{formatNumber(total, locale)}</span>
            <span className="text-muted-foreground text-xs">{t('ordersLabel')}</span>
          </div>
        </div>

        <ul className="min-w-40 flex-1 space-y-1.5">
          {data.map((slice) => (
            <li key={slice.status} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLOURS[slice.status] ?? 'var(--color-neutral-300)' }}
                aria-hidden
              />
              <span className="flex-1">{statusLabels(slice.status as 'placed')}</span>
              <span className="font-medium">{formatNumber(slice.total, locale)}</span>
            </li>
          ))}
        </ul>
      </div>

      {excluded > 0 && (
        <p className="text-2xs text-neutral-500">
          {t('statusTotalNote', {
            total: formatNumber(total, locale),
            counted: formatNumber(total - excluded, locale),
          })}
        </p>
      )}
    </div>
  );
}
