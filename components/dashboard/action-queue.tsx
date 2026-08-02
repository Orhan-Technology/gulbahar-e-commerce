import { getLocale, getTranslations } from 'next-intl/server';

import { ActionQueueList, type QueueRow } from '@/components/dashboard/action-queue-list';
import type { ActionQueueEntry } from '@/lib/db/queries/dashboard';
import { formatCurrency, formatDate, formatNumber, formatRelative } from '@/lib/format';
import { SLA_TONE, slaLevel } from '@/lib/queue-sla';

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

  const now = new Date();

  const rows: QueueRow[] = entries.map((entry) => {
    /*
     * SLA COLOURING applies to blocking rows only (Prompt C4). An expiring
     * promotion that has been "waiting" three days is not late — nobody is on
     * the other end of it — and colouring it red would spend the alarm on the
     * one row nobody has to rush.
     */
    const level = entry.urgency === 'blocking' ? slaLevel(entry.at, now) : 'fine';

    const base = {
      key: `${entry.kind}-${entry.id}`,
      kind: entry.kind,
      urgency: entry.urgency,
      href: entry.href,
      at: entry.at.toISOString(),
      /*
       * The age as PRESSURE, not as a timestamp. "waiting 3 days" is a fact
       * about a customer; "۲۸ سرطان" is a fact about a calendar, and only one
       * of them makes anyone pick up the phone.
       */
      waiting:
        entry.urgency === 'blocking' && level !== 'fine'
          ? t('waiting', { age: formatRelative(entry.at, locale, now.getTime()) })
          : undefined,
      slaLevel: level,
    };

    switch (entry.kind) {
      case 'new_order':
      case 'to_ready':
      case 'to_deliver':
      case 'to_collect': {
        // subtitle is packed as "itemCount|shopTotal|holdExpiresAt" by the query.
        const [count, total, holdExpires] = entry.subtitle.split('|');

        const TITLE_KEY = {
          new_order: 'newOrder',
          to_ready: 'markReady',
          to_deliver: 'toDeliver',
          to_collect: 'toCollect',
        } as const;

        return {
          ...base,
          orderId: entry.id,
          reference: entry.title,
          /*
           * Only the first two rows carry an inline advance. Handover is its own
           * control (`handover`) and collection needs the code the customer
           * reads out, which is a dialog on the order itself.
           */
          advanceTo:
            entry.kind === 'new_order'
              ? ('accepted' as const)
              : entry.kind === 'to_ready'
                ? ('ready' as const)
                : undefined,
          handover: entry.kind === 'to_deliver',
          /*
           * The rail is the SLA, not the row type: a two-hour-old order and a
           * three-day-old one are different situations. A waiting pickup is the
           * exception — it is not late, it is reserved stock, and amber is the
           * honest colour for something counting down that nobody is at fault for.
           */
          tone: entry.kind === 'to_collect' ? ('warning' as const) : SLA_TONE[level],
          title: t(TITLE_KEY[entry.kind], { reference: entry.title }),
          subtitle:
            /*
             * A waiting pickup says WHEN THE HOLD LAPSES rather than what it is
             * worth. The value is the same fact for every row on the list; the
             * deadline is the only thing that makes this one urgent, and it is
             * what the shopkeeper would otherwise have to open the order to find.
             */
            entry.kind === 'to_collect' && holdExpires
              ? t('toCollectSub', { date: formatDate(holdExpires, locale) })
              : t('newOrderSub', {
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
          tone: SLA_TONE[level],
          questionId: entry.id,
          title: t('needsAnswer', { product: entry.title }),
          // The question ITSELF, not a count of them: the shopkeeper can often
          // answer it in their head before they have clicked anything.
          subtitle: entry.subtitle,
        };
      case 'needs_reply':
        return {
          ...base,
          tone: 'primary' as const,
          reviewId: entry.id,
          title: t('needsReply', { product: entry.title }),
          subtitle: t('needsReplySub', {
            rating: formatNumber(Number(entry.subtitle), locale),
          }),
        };
      case 'out_of_stock':
        return {
          ...base,
          tone: 'warning' as const,
          productId: entry.id,
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

  /*
   * LEAD WITH MEANING (Prompt C4). The panel's first line used to be a bare
   * count in a pill; it now says what the count is ABOUT — "۲ مشتری منتظر
   * تأیید سفارش شما هستند" — because a number tells you there is work and a
   * sentence tells you what kind.
   */
  const blocking = rows.filter((row) => row.urgency === 'blocking').length;
  const lead =
    blocking > 0
      ? t('leadBlocking', { n: blocking, count: formatNumber(blocking, locale) })
      : rows.length > 0
        ? t('leadImportant', { n: rows.length, count: formatNumber(rows.length, locale) })
        : undefined;

  return (
    <ActionQueueList
      rows={rows}
      lead={lead}
      groupLabels={{
        blocking: t('groupBlocking'),
        important: t('groupImportant'),
        housekeeping: t('groupHousekeeping'),
      }}
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
