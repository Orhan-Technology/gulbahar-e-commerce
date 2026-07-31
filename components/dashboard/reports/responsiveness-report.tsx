import { getLocale, getTranslations } from 'next-intl/server';
import { Timer } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { ResponsivenessChart } from '@/components/dashboard/reports/responsiveness-chart';
import {
  responsiveness,
  responsivenessSummary,
  type ReportPeriod,
} from '@/lib/db/queries/shop-reports';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * How fast this shop answers, against the mall (Prompt C10).
 *
 * NOTHING MOVES BEHAVIOUR LIKE SEEING YOU ARE SLOWER THAN YOUR NEIGHBOURS —
 * and it is the one report a marketplace can produce that a shopkeeper could
 * never work out alone.
 *
 * Two rules make it fair rather than merely motivating, and both are enforced
 * in the query: the mall average EXCLUDES this shop, so a slow tenant is not
 * dragging down the line they are compared with, and no other shop is ever
 * named. A shopkeeper learns where they stand, not who to resent.
 *
 * The comparison sentence is written in PLAIN TERMS — faster, slower, about the
 * same — because a shopkeeper reading "3.1 vs 4.4" has to do the subtraction
 * and decide which direction is good, and this axis runs the opposite way from
 * every other chart in the console.
 */
export async function ResponsivenessReport({
  shopId,
  period,
}: {
  shopId: string;
  period: ReportPeriod;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopReports.responsiveness');

  const [series, summary] = await Promise.all([
    responsiveness(shopId, period),
    responsivenessSummary(shopId, period),
  ]);

  if (summary.acceptHours === null) {
    return (
      <EmptyState
        illustration={<Timer className="h-7 w-7" aria-hidden />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  const hours = (value: number | null) =>
    value === null ? '—' : t('hours', { hours: formatNumber(Math.round(value), locale) });

  /*
   * A tenth of the mall's median is the threshold for "about the same". Without
   * it the sentence flips between faster and slower on rounding noise, which is
   * how a comparison stops being believed.
   */
  const verdict = (() => {
    if (summary.mallAcceptHours === null || summary.acceptHours === null) return null;
    const margin = summary.mallAcceptHours * 0.1;
    if (summary.acceptHours < summary.mallAcceptHours - margin) return 'faster';
    if (summary.acceptHours > summary.mallAcceptHours + margin) return 'slower';
    return 'similar';
  })();

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3" data-responsiveness>
        <Cell label={t('yourAccept')} value={hours(summary.acceptHours)} strong />
        <Cell label={t('yourReady')} value={hours(summary.readyHours)} />
        <Cell label={t('mallAccept')} value={hours(summary.mallAcceptHours)} muted />
      </dl>

      {verdict && (
        <p
          data-verdict={verdict}
          className={cn(
            'rounded-card border p-3 text-sm',
            verdict === 'faster'
              ? 'border-success/30 bg-success-50 text-success-800'
              : verdict === 'slower'
                ? 'border-accent-warm/40 bg-accent-warm/10 text-neutral-800'
                : 'border-border bg-card text-muted-foreground',
          )}
        >
          {t(`verdict.${verdict}` as never)}
        </p>
      )}

      <div className="rounded-card border-border bg-card border p-4">
        <h3 className="mb-2 text-sm font-bold">{t('chartHeading')}</h3>
        <ResponsivenessChart data={series} />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-card border-border border p-3',
        muted ? 'bg-neutral-50' : 'bg-card',
      )}
    >
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-xl font-bold' : 'text-base font-semibold')}>
        {value}
      </dd>
    </div>
  );
}
