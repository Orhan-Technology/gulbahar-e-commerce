import type { UserRole } from './db/schema';

/**
 * Where a notification takes you (Prompt C12).
 *
 * A notification that cannot be opened is a fact you now have to go and act on
 * somewhere else — which is most of the reason notification centres get
 * ignored. Every row in the panel is a link, and this is the one place that
 * decides where to.
 *
 * BUILT FROM THE PAYLOAD ALREADY STORED, not from a new column. `notify()`
 * writes the template's own values as the payload (lib/notify.ts), so an order
 * notification already carries its reference and a campaign one its slot name.
 * Adding a `link` column would mean every existing row has none.
 *
 * ROLE-DEPENDENT, because the same event has two homes: `order.accepted` is the
 * customer's own order page and the shopkeeper's queue row, and sending a
 * shopkeeper to /account/orders would land them on somebody else's history.
 *
 * Returns null when there is nowhere useful to go — an OTP, an email code —
 * and the panel renders those as plain rows rather than dead links.
 */

export type NotificationCategory =
  | 'orders'
  | 'reviews'
  | 'questions'
  | 'promotions'
  | 'shops'
  | 'account';

/** Which category an event belongs to, for filters and for preferences. */
export function notificationCategory(eventKey: string): NotificationCategory {
  const [group] = eventKey.split('.');

  switch (group) {
    case 'order':
      return 'orders';
    case 'review':
      return 'reviews';
    case 'question':
      return 'questions';
    case 'campaign':
      return 'promotions';
    case 'shop':
      return 'shops';
    case 'verification':
      return 'shops';
    case 'user':
      return 'account';
    default:
      return 'account';
  }
}

export function notificationHref(
  eventKey: string,
  payload: Record<string, string | number> | null,
  role: UserRole,
): string | null {
  const reference = payload?.reference ? String(payload.reference) : null;
  const slug = payload?.shopSlug ? String(payload.shopSlug) : null;

  switch (eventKey) {
    case 'order.placed':
    case 'order.accepted':
    case 'order.rejected':
    case 'order.ready':
    case 'order.fulfilled':
    case 'order.collected':
    case 'order.holdExpired':
    case 'order.cancelled':
    case 'order.cancelledByMall':
      // The customer's own tracking page; a shopkeeper reading the same event
      // wants their queue, where the row is actionable.
      if (role === 'customer') return reference ? `/account/orders/${reference}` : '/account/orders';
      return '/dashboard/orders';

    case 'order.newForShop':
    case 'order.nudged':
    // A cancellation the shop needs to see before it walks to the shelf.
    case 'order.cancelledForShop':
    case 'order.cancelledByMallForShop':
      return '/dashboard/orders';

    case 'review.received':
    case 'review.responded':
      return role === 'shopkeeper' ? '/dashboard/reviews' : '/account/reviews';

    // The author's own copy of a removal. Their review list is where the
    // decision is visible; the product page no longer shows the review at all.
    case 'review.removed':
      return '/account/reviews';

    // Lands the admin on the queue it belongs in; the shop that raised it can
    // still see the review on its own list.
    case 'review.flagged':
      return role === 'admin' ? '/admin/reviews?status=reported' : '/dashboard/reviews';

    case 'question.asked':
      return '/dashboard/questions';
    case 'question.answered':
      return slug ? `/shops/${slug}` : '/account';

    case 'campaign.approved':
    case 'campaign.rejected':
    case 'campaign.expiring':
      return role === 'admin' ? '/admin/promotions' : '/dashboard/promotions';

    case 'shop.submitted':
      return '/admin/shops?status=pending';
    case 'shop.approved':
    case 'shop.rejected':
    case 'shop.invited':
    case 'shop.nudged':
    case 'shop.nudgedIssues':
    case 'shop.suspended':
    case 'shop.closed':
      return '/dashboard';

    // Straight to the catalogue, where the listing now sits under a status the
    // shopkeeper can act on.
    case 'shop.productUnpublished':
      return '/dashboard/products';

    // The applicant's own confirmation: back to the application, which is where
    // an amendment would be made while it waits.
    case 'shop.applicationReceived':
    case 'shop.resubmitted':
      return '/dashboard/register-shop';

    case 'verification.submitted':
      return '/admin/verifications';
    case 'verification.approved':
    case 'verification.rejected':
      return '/dashboard/settings/verification';

    case 'user.roleChanged':
      return '/account';

    // A sign-in code has already done its job by the time it is in a list.
    case 'otp':
    case 'email.verify':
      return null;

    default:
      return null;
  }
}

/**
 * The categories a person may mute (Prompt C12).
 *
 * `account` is deliberately NOT in the list. A role change or a security
 * message is not a preference — it is the platform telling somebody something
 * about their own access, and a mute switch on it would be a way to miss the
 * one notification that matters.
 */
export const MUTABLE_CATEGORIES = [
  'orders',
  'reviews',
  'questions',
  'promotions',
  'shops',
] as const;

export type MutableCategory = (typeof MUTABLE_CATEGORIES)[number];

/**
 * The subset a CUSTOMER is offered (finding #18).
 *
 * `promotions` is dropped, not because a customer may not hold the preference —
 * the column, the action and `MUTABLE_CATEGORIES` are unchanged — but because
 * every event in that category (`campaign.approved`, `campaign.rejected`,
 * `campaign.expiring`) is addressed to the shop that reserved the advertising
 * slot. Its own hint in the message file says so: «مخصوص دکان‌داران». A switch
 * that can only mute messages the reader can never receive is a control that
 * does nothing, on the screen where every other control does something.
 */
export const CUSTOMER_CATEGORIES = ['orders', 'reviews', 'questions', 'shops'] as const;

export type NotificationPreferences = Record<string, boolean>;

/** Everything on, which is what an account with no stored preference means. */
export function isCategoryEnabled(
  preferences: NotificationPreferences | null | undefined,
  category: NotificationCategory,
): boolean {
  if (category === 'account') return true;
  if (!preferences) return true;
  return preferences[category] !== false;
}
