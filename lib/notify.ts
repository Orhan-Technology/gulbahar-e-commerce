import { createTranslator } from 'next-intl';

import { db } from './db';
import { notifications, type DbLocale, type NotificationChannel, type UserRole } from './db/schema';
import faMessages from '../messages/fa.json';
import enMessages from '../messages/en.json';

/**
 * The single place notifications are created (Prompt 3.2, PRD §9.2).
 *
 * Every order transition, review response, campaign decision, shop approval, and
 * OTP flows through notify(). That is what makes the demo notification log
 * complete: if a code path skips this function, the client watches a screen where
 * nothing arrives.
 *
 * Templates are authored in Dari and English in messages/*.json under the
 * `notifications` namespace, so the log panel itself demonstrates the
 * multilingual capability (PRD §9.2). Bodies are RENDERED at write time and
 * stored, so the panel shows the exact text the recipient would have received
 * rather than re-resolving a template later against a different locale.
 *
 * This is also the seam where a real Afghan SMS gateway drops in behind the same
 * interface — only the delivery driver changes (PRD §12.3).
 */

/** Every template key that exists, so a typo is a type error rather than a blank SMS. */
export type NotificationEventKey =
  | 'otp'
  | 'order.placed'
  | 'order.newForShop'
  | 'order.accepted'
  | 'order.rejected'
  | 'order.ready'
  | 'order.fulfilled'
  | 'shop.submitted'
  | 'shop.approved'
  | 'shop.rejected'
  | 'shop.invited'
  | 'campaign.requested'
  | 'campaign.approved'
  | 'campaign.rejected'
  | 'campaign.expiring'
  | 'review.received'
  | 'review.responded';

type MessageTree = Record<string, unknown>;

const MESSAGES: Record<DbLocale, MessageTree> = {
  fa: faMessages as MessageTree,
  en: enMessages as MessageTree,
  // Pashto strings are deferred, so ps recipients receive Dari (PRD §11).
  ps: faMessages as MessageTree,
};

export type NotifyParams = {
  eventKey: NotificationEventKey;
  /** Null addresses the message to a role at large, e.g. the admin queue. */
  recipientUserId?: string | null;
  recipientRole: UserRole;
  /** 'sms' renders in the log as an outgoing message; 'inapp' feeds the bell. */
  channel?: NotificationChannel;
  locale?: DbLocale;
  /** Interpolated into the template, and stored for deep-linking from the log. */
  values?: Record<string, string | number>;
};

/**
 * Renders a template and inserts the notification row. Returns the created row
 * so callers can surface it immediately (the OTP flow uses this in dev).
 */
export async function notify(params: NotifyParams) {
  const {
    eventKey,
    recipientUserId = null,
    recipientRole,
    channel = 'sms',
    locale = 'fa',
    values = {},
  } = params;

  const { title, body } = renderTemplate(eventKey, locale, values);

  const [row] = await db
    .insert(notifications)
    .values({
      eventKey,
      recipientUserId,
      recipientRole,
      channel,
      locale,
      title,
      body,
      payload: values,
    })
    .returning();

  return row;
}

/** Inserts several notifications in one round trip (e.g. one per shop in a basket). */
export async function notifyMany(items: NotifyParams[]) {
  if (items.length === 0) return [];

  const rows = items.map((item) => {
    const locale = item.locale ?? 'fa';
    const values = item.values ?? {};
    const { title, body } = renderTemplate(item.eventKey, locale, values);
    return {
      eventKey: item.eventKey,
      recipientUserId: item.recipientUserId ?? null,
      recipientRole: item.recipientRole,
      channel: item.channel ?? ('sms' as NotificationChannel),
      locale,
      title,
      body,
      payload: values,
    };
  });

  return db.insert(notifications).values(rows).returning();
}

/**
 * Resolves `notifications.<eventKey>.title` and `.body` for a locale.
 *
 * Falls back to Dari, then to the raw key, rather than throwing — a missing
 * template must never take down an order transition mid-demo. The key surfacing
 * in the log panel is a loud, obvious signal to fix it.
 */
export function renderTemplate(
  eventKey: NotificationEventKey,
  locale: DbLocale,
  values: Record<string, string | number>,
) {
  const namespace = `notifications.${eventKey}`;

  for (const candidate of [locale, 'fa' as DbLocale]) {
    try {
      const t = createTranslator({
        locale: candidate,
        messages: MESSAGES[candidate] as never,
        namespace: namespace as never,
      });
      return {
        title: t('title' as never, values as never) as unknown as string,
        body: t('body' as never, values as never) as unknown as string,
      };
    } catch {
      // Try the next candidate locale.
    }
  }

  return { title: eventKey, body: JSON.stringify(values) };
}
