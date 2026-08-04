import { getLocale, getTranslations } from 'next-intl/server';

import {
  AdminActionQueueList,
  type AdminQueueRow,
} from '@/components/admin/admin-action-queue-list';
import type { AdminQueueEntry } from '@/lib/db/queries/admin-overview';
import { formatCurrency, formatNumber, formatPhone, formatUnitNumber } from '@/lib/format';
import { SLA_HOURS, slaLevel } from '@/lib/queue-sla';

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

/** The window the done state reports on. A day, in hours — see the query. */
export const DONE_STATE_HOURS = 24;

export async function AdminActionQueue({
  entries,
  decisionsToday,
  now,
}: {
  entries: AdminQueueEntry[];
  /** Audit rows written in the last `DONE_STATE_HOURS` — the done state's number. */
  decisionsToday: number;
  /**
   * ONE clock read for the whole queue, taken by the caller.
   *
   * Read here it would be an impure call during render, which React 19 forbids
   * and the lint rule enforces — server component or not (CLAUDE.md). Passing
   * it in also buys the thing the rule is really protecting: every row is aged
   * against the SAME instant, so two rows either side of a threshold cannot
   * disagree by a level, and no row flickers between amber and red on a
   * refresh. A row nobody trusts is worse than a row with no chip at all.
   */
  now: Date;
}) {
  const locale = await getLocale();
  const t = await getTranslations('adminOverview.queue');
  const nowMs = now.getTime();

  /**
   * How long this has been waiting, in the stalled order's grammar (Prompt C12).
   *
   * «بیش از ۴۸ ساعت» was on exactly one row type, and it was the only row on
   * the queue an admin could prioritise without doing arithmetic on a relative
   * timestamp. Every row now carries the same phrase and the same three-level
   * scale (lib/queue-sla.ts), which is what makes the list sort itself in the
   * reader's head: a three-hour-old campaign request and a nine-day-old
   * verification stop looking alike.
   */
  const waitPhrase = (at: Date) => {
    const hours = Math.max(0, (nowMs - at.getTime()) / 3_600_000);
    const level = slaLevel(at, now);

    const label =
      hours >= SLA_HOURS.danger
        ? // The stalled order's own words, now shared: "more than 48 hours".
          t('waitedOverThreshold', { hours: formatNumber(SLA_HOURS.danger, locale) })
        : // The shared table, not a literal 24: the day boundary and the
          // "late" threshold are the same promise (lib/queue-sla.ts), and two
          // copies of it drift the moment one of them is tuned.
          hours >= SLA_HOURS.warning
          ? t('waitedDays', {
              n: Math.floor(hours / 24),
              count: formatNumber(Math.floor(hours / 24), locale),
            })
          : hours >= 1
            ? t('waitedHours', {
                n: Math.floor(hours),
                count: formatNumber(Math.floor(hours), locale),
              })
            : t('waitedJustNow');

    return { label, level };
  };

  const rows: AdminQueueRow[] = entries.map((entry) => {
    const wait = waitPhrase(entry.at);
    const base = {
      key: `${entry.kind}-${entry.id}`,
      kind: entry.kind,
      href: entry.href,
      at: entry.at.toISOString(),
      monogram: entry.monogram,
      waited: wait.label,
      waitLevel: wait.level,
    };

    switch (entry.kind) {
      case 'pending_shop': {
        /*
         * THE EVIDENCE, AS FACTS ON THE ROW (Prompt C12).
         *
         * "Category: dried fruit" told an approver nothing they could decide
         * on. What decides it is whether there is a shop behind the
         * registration — a banner, a catalogue, a door, and a person to ring —
         * so those four are on the card and the click-through is now optional.
         *
         * Each fact is skipped rather than rendered empty: «۰ محصول» is a real
         * and useful statement, but «طبقه —, واحد —» is furniture.
         */
        const facts: string[] = [];
        if (entry.subtitle) facts.push(entry.subtitle);
        if (entry.productCount !== undefined) {
          facts.push(
            t('shopProducts', {
              n: entry.productCount,
              count: formatNumber(entry.productCount, locale),
              total: formatNumber(entry.totalProductCount ?? entry.productCount, locale),
            }),
          );
        }
        if (entry.floor !== null && entry.floor !== undefined) {
          facts.push(
            t('shopFloorUnit', {
              floor: formatNumber(entry.floor, locale),
              unit: formatUnitNumber(entry.unitNumber, locale) || '—',
            }),
          );
        }

        return {
          ...base,
          decisionId: entry.id,
          decisionKind: 'shop' as const,
          tone: 'danger' as const,
          title: t('pendingShop', { shop: entry.title }),
          subtitle: '',
          facts,
          imagePath: entry.imagePath ?? null,
          // The phone is its own field, not a fact: it is `dir="ltr"` and
          // formatted, and folding it into a dot-separated run of Dari text
          // reverses its digits at the bidi boundary.
          contactName: entry.ownerName ?? null,
          contactPhone: entry.ownerPhone ? formatPhone(entry.ownerPhone, locale) : null,
        };
      }
      case 'verification':
        return {
          ...base,
          verificationId: entry.id,
          tone: 'warning' as const,
          title: t('verification', { shop: entry.title }),
          subtitle: t('verificationSub'),
          facts: entry.documentCount
            ? [
                t('verificationDocuments', {
                  n: entry.documentCount,
                  count: formatNumber(entry.documentCount, locale),
                }),
              ]
            : [],
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
          reviewId: entry.id,
          tone: 'primary' as const,
          title: t('reportedReview', { product: entry.title }),
          subtitle: t('reportedReviewSub', {
            rating: formatNumber(Number(entry.subtitle), locale),
          }),
          // THE REVIEW'S OWN WORDS. A score out of five cannot decide a
          // moderation call; the text is the only thing that can.
          excerpt: entry.excerpt ?? null,
          facts: entry.shopName ? [t('reviewOnShop', { shop: entry.shopName })] : [],
        };
      case 'stale_order':
        return {
          ...base,
          orderId: entry.id,
          // The queue's title for this row IS the reference (see the query), so
          // the cancel dialog can name the order without a second lookup.
          orderReference: entry.title,
          // Past the shared 48-hour threshold by definition (lib/queue-sla.ts),
          // so it is late rather than merely old.
          tone: 'danger' as const,
          title: t('staleOrder', { reference: entry.title }),
          // The «بیش از ۴۸ ساعت» clause moved OUT of this string and onto the
          // shared wait chip, which every row now carries — so the sentence
          // here is just who is not answering.
          subtitle: entry.subtitle ? t('staleOrderShop', { shop: entry.subtitle }) : '',
        };
    }
  });

  /*
   * OVERDUE FIRST, THEN THE ORIGINAL ORDER.
   *
   * The queue is ranked shops → verifications → campaigns → reviews → orders,
   * which is money and reputation first and is right most of the time. What it
   * could not express is that a nine-day-old reported review outranks a
   * campaign request from this morning. A single stable partition on the shared
   * 48-hour threshold says that without throwing the ranking away: past the
   * SLA a row is late whatever it is about, and inside it the money order
   * stands.
   */
  const ranked = [
    ...rows.filter((row) => row.waitLevel === 'danger'),
    ...rows.filter((row) => row.waitLevel !== 'danger'),
  ];

  const hidden = Math.max(0, ranked.length - VISIBLE_ROWS);

  return (
    <AdminActionQueueList
      rows={ranked}
      heading={t('heading')}
      emptyTitle={t('allClearTitle')}
      /*
       * THE DONE STATE SAYS WHAT WAS DONE (Prompt C12).
       *
       * «هیچ کاری منتظر شما نیست» is true and inert. «سرتان خلوت است — ۶ تصمیم
       * در ۲۴ ساعت گذشته» is the same fact with the work attached to it, and
       * the link into the audit log is where "which six?" is answered. With
       * nothing decided in the window it falls back to the plain sentence
       * rather than boasting about zero.
       */
      emptyBody={
        decisionsToday > 0
          ? t('allClearWithCount', {
              n: decisionsToday,
              count: formatNumber(decisionsToday, locale),
              hours: formatNumber(DONE_STATE_HOURS, locale),
            })
          : t('allClearBody')
      }
      emptyAction={
        decisionsToday > 0
          ? { label: t('allClearAction'), href: '/admin/audit' }
          : undefined
      }
      showMoreLabel={t('showMore', {
        // `n` pluralises, `count` renders — see lib/db/queries/dashboard.ts.
        n: hidden,
        count: formatNumber(hidden, locale),
      })}
      visibleRows={VISIBLE_ROWS}
    />
  );
}
