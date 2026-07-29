import { getLocale, getTranslations } from 'next-intl/server';

import {
  AdminActionQueueList,
  type AdminQueueRow,
} from '@/components/admin/admin-action-queue-list';
import type { AdminQueueEntry } from '@/lib/db/queries/admin-overview';
import { formatCurrency, formatNumber } from '@/lib/format';

/**
 * The admin action centre — one queue across four tables (PRD §7).
 *
 * SERVER HALF: formatting only. Currency, Persian digits and plurals are
 * resolved here so the interactive half receives finished strings, which is the
 * same split the shopkeeper's queue uses.
 *
 * Rows shown before the queue offers to expand. Declared here rather than beside
 * the code that uses it: this module is a server component and the list is
 * `'use client'`, so a constant exported from there would arrive as a client
 * reference and the arithmetic below would produce NaN (CLAUDE.md).
 */
const VISIBLE_ROWS = 6;

export async function AdminActionQueue({ entries }: { entries: AdminQueueEntry[] }) {
  const locale = await getLocale();
  const t = await getTranslations('adminOverview.queue');

  const rows: AdminQueueRow[] = entries.map((entry) => {
    const base = {
      key: `${entry.kind}-${entry.id}`,
      kind: entry.kind,
      href: entry.href,
      at: entry.at.toISOString(),
      monogram: entry.monogram,
    };

    switch (entry.kind) {
      case 'pending_shop':
        return {
          ...base,
          decisionId: entry.id,
          decisionKind: 'shop' as const,
          tone: 'danger' as const,
          title: t('pendingShop', { shop: entry.title }),
          subtitle: entry.subtitle ? t('pendingShopSub', { category: entry.subtitle }) : '',
        };
      case 'requested_campaign': {
        // Packed as "slot|price" by the query.
        const [slot, price] = entry.subtitle.split('|');
        return {
          ...base,
          decisionId: entry.id,
          decisionKind: 'campaign' as const,
          tone: 'warning' as const,
          title: t('requestedCampaign', { shop: entry.title }),
          subtitle: t('requestedCampaignSub', {
            slot,
            price: formatCurrency(Number(price), locale),
          }),
        };
      }
      case 'reported_review':
        return {
          ...base,
          tone: 'primary' as const,
          title: t('reportedReview', { product: entry.title }),
          subtitle: t('reportedReviewSub', {
            rating: formatNumber(Number(entry.subtitle), locale),
          }),
        };
      case 'stale_order':
        return {
          ...base,
          tone: 'muted' as const,
          title: t('staleOrder', { reference: entry.title }),
          subtitle: entry.subtitle ? t('staleOrderSub', { shop: entry.subtitle }) : '',
        };
    }
  });

  const hidden = Math.max(0, rows.length - VISIBLE_ROWS);

  return (
    <AdminActionQueueList
      rows={rows}
      heading={t('heading')}
      emptyTitle={t('allClearTitle')}
      emptyBody={t('allClearBody')}
      showMoreLabel={t('showMore', {
        // `n` pluralises, `count` renders — see lib/db/queries/dashboard.ts.
        n: hidden,
        count: formatNumber(hidden, locale),
      })}
      visibleRows={VISIBLE_ROWS}
    />
  );
}
