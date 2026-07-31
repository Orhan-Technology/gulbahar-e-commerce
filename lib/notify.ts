import { createTranslator } from 'next-intl';

import { eq } from 'drizzle-orm';

import { db } from './db';
import {
  notifications,
  users,
  type DbLocale,
  type NotificationChannel,
  type UserRole,
} from './db/schema';
import { isCategoryEnabled, notificationCategory } from './notification-links';
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
  | 'email.verify'
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
  | 'review.responded'
  | 'order.collected'
  | 'order.holdExpired'
  | 'order.nudged'
  | 'shop.nudged'
  | 'verification.submitted'
  | 'verification.approved'
  | 'verification.rejected'
  | 'question.asked'
  | 'question.answered'
  | 'user.roleChanged';

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
  /**
   * Interpolated into the template, and stored for deep-linking from the log.
   *
   * Monetary amounts MUST be pre-formatted by the caller via
   * lib/format.ts formatCurrency(), so an SMS reads exactly like the UI —
   * Persian digits and a ؋ prefix in Dari rather than a bare ASCII integer.
   */
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

  /*
   * MUTED CATEGORIES ARE NOT WRITTEN AT ALL (Prompt C12).
   *
   * Checked here rather than filtered at read time, because a notification the
   * recipient asked not to receive should not exist: one that exists but is
   * hidden still appears in the demo log, and the bell and the log must never
   * disagree. `otp` and every account-level message bypass this — a sign-in
   * code is not a preference.
   */
  if (recipientUserId) {
    const [recipient] = await db
      .select({ prefs: users.notificationPrefs })
      .from(users)
      .where(eq(users.id, recipientUserId))
      .limit(1);

    if (!isCategoryEnabled(recipient?.prefs, notificationCategory(eventKey))) return null;
  }

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
 * Event keys are dotted (`order.placed`) and next-intl treats a dot as nesting,
 * so the templates in messages/*.json must be NESTED objects, not flat keys
 * containing dots. A flat `"order.placed"` key resolves to nothing.
 *
 * Detection is via onError rather than try/catch: createTranslator does not throw
 * on a missing message, it returns the key path as the string and reports through
 * onError. An earlier version wrapped this in try/catch, so the Dari fallback
 * never ran and every seeded notification stored a raw key as its body — the
 * exact failure the on-screen log panel exists to make visible.
 *
 * Falls back to Dari, then to the key, rather than throwing: a missing template
 * must never take down an order transition mid-demo. The console warning is what
 * makes it impossible to miss.
 */
export function renderTemplate(
  eventKey: NotificationEventKey,
  locale: DbLocale,
  values: Record<string, string | number>,
) {
  const namespace = `notifications.${eventKey}`;

  for (const candidate of [locale, 'fa' as DbLocale]) {
    let failed = false;
    const t = createTranslator({
      locale: candidate,
      messages: MESSAGES[candidate] as never,
      namespace: namespace as never,
      onError: () => {
        failed = true;
      },
    });

    const title = t('title' as never, values as never) as unknown as string;
    const body = t('body' as never, values as never) as unknown as string;

    if (!failed) return { title, body };
  }

  console.warn(
    `[notify] missing template for "${eventKey}" — add notifications.${eventKey}.{title,body} ` +
      'to messages/fa.json and messages/en.json (nested, not a dotted key)',
  );
  return { title: eventKey, body: JSON.stringify(values) };
}
