import { getLocale, getTranslations } from 'next-intl/server';

import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema/shared';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

/** The shape `lib/audit.ts` stores. Flat by schema — see the note in that file. */
export type AuditDetail = Record<string, string | number | null>;

/**
 * Keys whose values are MONEY, in afghanis. Everything else numeric is a count.
 *
 * Named explicitly rather than guessed from the value, because `capacity: 4`
 * and `pricePaid: 96000` are both integers and only one of them wants a ؋.
 */
const CURRENCY_KEYS = new Set([
  'pricePaid',
  'pricePerWeek',
  'deliveryFee',
  'freeDeliveryThreshold',
  'minOrderValue',
]);

const COUNT_KEYS = new Set([
  'capacity',
  'weeks',
  'count',
  'restoredUnits',
  'shops',
  'deliveryEtaMinutes',
]);

/** Keys that are a timestamp. */
const DATE_KEYS = new Set(['expiresAt']);

/**
 * The audit log's payload, in Dari (Prompt C10).
 *
 * WHAT THIS REPLACES. The page printed `Object.entries(detail).join(' · ')`, so
 * the record of a mall's decisions read `pricePaid: 96000`, `to: customer ·
 * from: shopkeeper` and, on a settings change, an unformatted JSON value —
 * English keys, no currency, no translation, machine order. A log nobody can
 * read is a log nobody checks, which defeats the entire reason the console
 * keeps one.
 *
 * Three things happen here and each is per-EVENT-TYPE, because the same key
 * means different things in different rows:
 *   - `from`/`to` are resolved against the vocabulary of the thing that moved —
 *     roles for `user.role`, shop statuses for `shop.status`, order statuses for
 *     `order.cancel`, and a bare floor/unit pair for `shop.unit`;
 *   - money is formatted as money and counts as counts, in Persian digits;
 *   - a settings change carries BOTH sides (see admin-settings.ts) and renders
 *     as «کرایه تحویل: ۱۵۰ ← ۷۷۷», which is the sentence somebody actually
 *     wanted when they opened this page.
 *
 * ANYTHING UNRECOGNISED STILL RENDERS, as `key: value`. A log that silently
 * dropped a payload it had no rule for would be worse than the raw dump it
 * replaced — the missing line is invisible, the ugly line is merely ugly.
 */
export async function AuditDetail({
  action,
  detail,
}: {
  action: string;
  detail: AuditDetail | null;
}) {
  const locale = await getLocale();
  const t = await getTranslations('adminAudit.detail');
  const tRoles = await getTranslations('adminUsers.roles');
  const tShopStatus = await getTranslations('adminShops.filters');
  const tOrderStatus = await getTranslations('adminOrders.status');

  if (!detail || Object.keys(detail).length === 0) return null;

  /** The vocabulary `from`/`to` should be read in, for THIS action. */
  const term = (value: string): string => {
    if (action === 'user.role') {
      return tRoles.has(value as never) ? tRoles(value as never) : value;
    }
    if (action === 'shop.status') {
      return tShopStatus.has(value as never) ? tShopStatus(value as never) : value;
    }
    if (action === 'order.cancel') {
      return tOrderStatus.has(value as never) ? tOrderStatus(value as never) : value;
    }
    return value;
  };

  /** One value, formatted for what its key means. */
  const value = (key: string, raw: string | number | null): string => {
    if (raw === null || raw === '') return '—';
    const text = String(raw);

    if (DATE_KEYS.has(key)) return formatDate(text, locale, 'medium');
    if (CURRENCY_KEYS.has(key)) return formatCurrency(Number(text), locale);
    if (COUNT_KEYS.has(key)) return formatNumber(Number(text), locale);

    // A settings change arrives as "old → new"; each side goes through the same
    // scalar rules, and the arrow itself belongs to the message file, which
    // owns its direction in each script.
    if (text.includes(' → ')) {
      const [from, to] = text.split(' → ');
      return t('change', { from: scalar(key, from), to: scalar(key, to) });
    }

    if (key === 'from' || key === 'to') return term(text);
    return scalar(key, text);
  };

  /** One side of a value: a boolean, a localised blob, a number, or text. */
  const scalar = (key: string, text: string): string => {
    if (text === '') return '—';
    if (text === 'true') return t('yes');
    if (text === 'false') return t('no');
    if (CURRENCY_KEYS.has(key) && /^-?\d+$/.test(text)) {
      return formatCurrency(Number(text), locale);
    }

    /*
     * A LOCALISED FIELD, stored as JSON.
     *
     * `updateMarketplaceSettings` JSON-stringifies any object value before
     * logging it, so a change to the mall's name reached this page as
     * `{"fa":"مرکز خرید گلبهار","en":"Gulbahar Center"}` — the literal payload,
     * braces and quotes and a Latin key, in the middle of a Dari sentence. The
     * reader wants the name in their own language; the other translation is not
     * what the row is about.
     */
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return pickLocale(parsed as LocalizedText, locale) || text;
        }
      } catch {
        // Not JSON after all — fall through and print it as written rather
        // than swallowing a value the reader might need.
      }
    }

    // A bare integer with no key rule is still a number a Dari reader reads.
    if (/^-?\d+$/.test(text)) return formatNumber(Number(text), locale);
    return text;
  };

  /*
   * `from` and `to` are ONE fact, so they are rendered as one chip in the order
   * they happened. Separately they read as two unrelated attributes — which is
   * exactly how «to: customer · from: shopkeeper» ended up on screen backwards.
   */
  const entries: Array<{ key: string; label: string; text: string }> = [];
  const from = detail.from;
  const to = detail.to;
  if (from !== undefined || to !== undefined) {
    entries.push({
      key: 'transition',
      label: t('transition'),
      text: t('change', {
        from: from === undefined || from === null ? '—' : term(String(from)),
        to: to === undefined || to === null ? '—' : term(String(to)),
      }),
    });
  }

  for (const [key, raw] of Object.entries(detail)) {
    if (key === 'from' || key === 'to') continue;
    entries.push({
      key,
      label: t.has(`keys.${key}` as never) ? t(`keys.${key}` as never) : key,
      text: value(key, raw),
    });
  }

  return (
    <p className="text-2xs flex flex-wrap gap-x-3 gap-y-1 text-neutral-500" data-audit-detail>
      {entries.map((entry) => (
        <span key={entry.key}>
          <span className="text-neutral-400">{entry.label}: </span>
          <span className="font-medium text-neutral-600 tabular-nums">{entry.text}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * Where an audit row points.
 *
 * Every line named a thing and none of them linked to it, so "who suspended
 * Pamir Shoes" ended with the reader typing the shop's name into another
 * screen's search box. Products and reviews have no admin detail route, so they
 * land on their LIST pre-filtered rather than pretending to have one — the same
 * rule the KPI drill-downs follow.
 *
 * Returns null when the row has no id to point at (a settings change is about
 * the platform, not about a row), so the caller renders plain text.
 */
export function auditTargetHref(
  targetType: string,
  targetId: string | null,
  targetLabel: string | null,
): string | null {
  switch (targetType) {
    case 'shop':
      // A uuid column: a slug reaching it is a Postgres type error (CLAUDE.md).
      return targetId ? `/admin/shops/${targetId}` : null;
    case 'order':
      return targetId ? `/admin/orders/${targetId}` : null;
    case 'product':
      return targetLabel ? `/admin/products?q=${encodeURIComponent(targetLabel)}` : '/admin/products';
    case 'review':
      return '/admin/reviews';
    case 'category':
      return '/admin/categories';
    case 'user':
      return targetLabel ? `/admin/users?q=${encodeURIComponent(targetLabel)}` : '/admin/users';
    case 'campaign':
    case 'slot':
      return '/admin/promotions';
    case 'settings':
      return '/admin/settings';
    default:
      return null;
  }
}
