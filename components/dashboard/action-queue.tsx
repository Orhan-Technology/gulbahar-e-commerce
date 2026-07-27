import { getLocale, getTranslations } from 'next-intl/server';
import { CheckCircle2, PackageX, ShoppingCart, Timer, Truck } from 'lucide-react';

import { ActionQueueItem } from '@/components/custom/action-queue-item';
import { EmptyState } from '@/components/custom/empty-state';
import type { ActionQueueEntry } from '@/lib/db/queries/dashboard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

/**
 * The action queue — the dashboard centrepiece (PRD §6.1).
 *
 * Answers "what needs my attention" in one glance, and every row deep-links to the
 * exact record. An empty queue is a POSITIVE state, not a blank: a shopkeeper who
 * has cleared everything should be told so.
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
    <ul className="space-y-2">
      {entries.map((entry, index) => {
        const { icon, tone, title, subtitle } = describe(entry, locale, t);
        return (
          <li key={`${entry.kind}-${entry.id}`}>
            <ActionQueueItem
              icon={icon}
              title={title}
              subtitle={subtitle}
              timestamp={entry.at}
              href={entry.href}
              tone={tone}
              // Only the first few animate in; 12 rows sliding at once is noise.
              isNew={index < 3}
            />
          </li>
        );
      })}
    </ul>
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
        icon: <ShoppingCart className="h-5 w-5" />,
        tone: 'primary' as const,
        title: t('newOrder', { reference: entry.title }),
        subtitle: t('newOrderSub', {
          count: formatNumber(Number(count), locale),
          total: formatCurrency(Number(total), locale),
        }),
      };
    }
    case 'to_ready': {
      const [count, total] = entry.subtitle.split('|');
      return {
        icon: <Truck className="h-5 w-5" />,
        tone: 'warning' as const,
        title: t('markReady', { reference: entry.title }),
        subtitle: t('newOrderSub', {
          count: formatNumber(Number(count), locale),
          total: formatCurrency(Number(total), locale),
        }),
      };
    }
    case 'out_of_stock':
      return {
        icon: <PackageX className="h-5 w-5" />,
        tone: 'danger' as const,
        title: t('outOfStock', { product: entry.title }),
        subtitle: t('outOfStockSub'),
      };
    case 'expiring_promotion':
      return {
        icon: <Timer className="h-5 w-5" />,
        tone: 'warning' as const,
        title: t('expiring', { slot: entry.title }),
        subtitle: t('expiringSub', { date: formatDate(entry.subtitle, locale) }),
      };
  }
}
