import { getLocale, getTranslations } from 'next-intl/server';
import { CheckCircle2 } from 'lucide-react';

import { ActionQueueItem } from '@/components/custom/action-queue-item';
import { EmptyState } from '@/components/custom/empty-state';
import { OrderActions } from '@/components/dashboard/orders/order-actions';
import type { ActionQueueEntry } from '@/lib/db/queries/dashboard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

/**
 * The action queue — the dashboard centrepiece (PRD §6.1).
 *
 * Answers "what needs my attention" in one glance, and every row deep-links to the
 * exact record. An empty queue is a POSITIVE state, not a blank: a shopkeeper who
 * has cleared everything should be told so.
 *
 * Order rows carry their own accept / reject / mark-ready controls. That is the
 * point of the screen: a shopkeeper behind the counter with a customer waiting
 * should not have to open the order to say yes. The controls are the same
 * `OrderActions` the order page uses, so the legal-transition rules and the
 * mandatory rejection reason are not reimplemented here.
 */
export async function ActionQueue({ entries }: { entries: ActionQueueEntry[] }) {
  const locale = await getLocale();
  const t = await getTranslations('dashboard.queue');

  if (entries.length === 0) {
    return (
      <EmptyState
        illustration={<CheckCircle2 className="h-7 w-7" />}
        title={t('allCaughtUpTitle')}
        description={t('allCaughtUpBody')}
      />
    );
  }

  return (
    <section className="rounded-card border-border bg-card overflow-hidden border">
      <header className="border-border flex items-center gap-2 border-b p-4">
        <h2 className="text-sm font-bold">{t('heading')}</h2>
        <span className="rounded-pill bg-danger text-danger-fg px-2 py-1 text-2xs font-bold tabular-nums">
          {formatNumber(entries.length, locale)}
        </span>
      </header>

      <ul className="divide-border divide-y">
        {entries.map((entry, index) => {
          const { tone, title, subtitle } = describe(entry, locale, t);
          return (
            <li key={`${entry.kind}-${entry.id}`}>
              <ActionQueueItem
                title={title}
                subtitle={subtitle}
                timestamp={entry.at}
                href={entry.href}
                tone={tone}
                actions={
                  entry.kind === 'new_order' ? (
                    <OrderActions orderId={entry.id} status="placed" size="sm" />
                  ) : entry.kind === 'to_ready' ? (
                    <OrderActions orderId={entry.id} status="accepted" size="sm" />
                  ) : undefined
                }
                // Only the first few animate in; 12 rows sliding at once is noise.
                isNew={index < 3}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function describe(
  entry: ActionQueueEntry,
  locale: string,
  t: Awaited<ReturnType<typeof getTranslations<'dashboard.queue'>>>,
) {
  switch (entry.kind) {
    case 'new_order': {
      // subtitle is packed as "itemCount|shopTotal" by the query.
      const [count, total] = entry.subtitle.split('|');
      return {
        tone: 'danger' as const,
        title: t('newOrder', { reference: entry.title }),
        subtitle: t('newOrderSub', {
          // `n` pluralises, `count` renders — see the dashboard stat row.
          n: Number(count),
          count: formatNumber(Number(count), locale),
          total: formatCurrency(Number(total), locale),
        }),
      };
    }
    case 'to_ready': {
      const [count, total] = entry.subtitle.split('|');
      return {
        tone: 'warning' as const,
        title: t('markReady', { reference: entry.title }),
        subtitle: t('newOrderSub', {
          // `n` pluralises, `count` renders — see the dashboard stat row.
          n: Number(count),
          count: formatNumber(Number(count), locale),
          total: formatCurrency(Number(total), locale),
        }),
      };
    }
    case 'out_of_stock':
      return {
        tone: 'warning' as const,
        title: t('outOfStock', { product: entry.title }),
        subtitle: t('outOfStockSub'),
      };
    case 'expiring_promotion':
      return {
        tone: 'muted' as const,
        title: t('expiring', { slot: entry.title }),
        subtitle: t('expiringSub', { date: formatDate(entry.subtitle, locale) }),
      };
  }
}
