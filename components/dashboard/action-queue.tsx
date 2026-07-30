import { getLocale, getTranslations } from 'next-intl/server';

import { ActionQueueList, type QueueRow } from '@/components/dashboard/action-queue-list';
import type { ActionQueueEntry } from '@/lib/db/queries/dashboard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

/**
 * The action queue — the dashboard's hero, above every number on the screen
 * (PRD §6.1).
 *
 * It answers "what needs me right now" and every row deep-links to the exact
 * record. An empty queue is a POSITIVE state, not a blank: a shopkeeper who has
 * cleared everything should be told so.
 *
 * SERVER HALF. Formatting happens here — currency, Persian digits, relative
 * dates, plurals — so the client half receives finished strings and never sees
 * a locale, a price or a database row. That keeps the interactive part small
 * and means a translation change cannot break the optimistic list.
 */
/**
 * Rows shown before the queue offers to expand.
 *
 * The queue is ordered most-urgent-first, so the cap never hides an order
 * behind a stock warning. It exists because the screen has a budget: a shop
 * with nine unanswered reviews would otherwise push the KPIs, the chart and the
 * best sellers past two phone screens, and a dashboard nobody scrolls to the
 * end of has no KPIs at all.
 *
 * Declared HERE, in the server half, and passed down. See the `visibleRows`
 * prop for why it cannot live beside the code that uses it.
 */
const VISIBLE_ROWS = 6;

export async function ActionQueue({ entries }: { entries: ActionQueueEntry[] }) {
  const locale = await getLocale();
  const t = await getTranslations('dashboard.queue');

  const rows: QueueRow[] = entries.map((entry) => {
    const base = {
      key: `${entry.kind}-${entry.id}`,
      kind: entry.kind,
      href: entry.href,
      at: entry.at.toISOString(),
    };

    switch (entry.kind) {
      case 'new_order':
      case 'to_ready': {
        // subtitle is packed as "itemCount|shopTotal" by the query.
        const [count, total] = entry.subtitle.split('|');
        return {
          ...base,
          orderId: entry.id,
          reference: entry.title,
          advanceTo: entry.kind === 'new_order' ? ('accepted' as const) : ('ready' as const),
          tone: entry.kind === 'new_order' ? ('danger' as const) : ('warning' as const),
          title: t(entry.kind === 'new_order' ? 'newOrder' : 'markReady', {
            reference: entry.title,
          }),
          subtitle: t('newOrderSub', {
            // `n` pluralises, `count` renders — see the dashboard stat row.
            n: Number(count),
            count: formatNumber(Number(count), locale),
            total: formatCurrency(Number(total), locale),
          }),
        };
      }
      case 'needs_answer':
        return {
          ...base,
          tone: 'primary' as const,
          title: t('needsAnswer', { product: entry.title }),
          // The question ITSELF, not a count of them: the shopkeeper can often
          // answer it in their head before they have clicked anything.
          subtitle: entry.subtitle,
        };
      case 'needs_reply':
        return {
          ...base,
          tone: 'primary' as const,
          title: t('needsReply', { product: entry.title }),
          subtitle: t('needsReplySub', {
            rating: formatNumber(Number(entry.subtitle), locale),
          }),
        };
      case 'out_of_stock':
        return {
          ...base,
          tone: 'warning' as const,
          title: t('outOfStock', { product: entry.title }),
          subtitle: t('outOfStockSub'),
        };
      case 'expiring_promotion':
        return {
          ...base,
          tone: 'muted' as const,
          title: t('expiring', { slot: entry.title }),
          subtitle: t('expiringSub', { date: formatDate(entry.subtitle, locale) }),
        };
    }
  });

  const hidden = Math.max(0, rows.length - VISIBLE_ROWS);

  return (
    <ActionQueueList
      rows={rows}
      heading={t('heading')}
      emptyTitle={t('allCaughtUpTitle')}
      emptyBody={t('allCaughtUpBody')}
      showMoreLabel={t('showMore', {
        // `n` pluralises, `count` renders — see the note in the query module.
        n: hidden,
        count: formatNumber(hidden, locale),
      })}
      visibleRows={VISIBLE_ROWS}
    />
  );
}
