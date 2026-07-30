/**
 * How long is too long, in one place (Prompt C4).
 *
 * The shopkeeper's queue and the admin's stalled-order rule both had their own
 * idea of "late" — the dashboard said nothing at all and the admin used a
 * hard-coded 48 hours in a SQL string. Two definitions of the same promise is
 * how a mall ends up telling a tenant they are fine on one screen and chasing
 * them on another.
 *
 * The numbers are a Kabul retail day, not a courier SLA: a shop that answers
 * within half a day is doing well, one that has not answered by the next
 * morning is late, and two days is when the customer has already gone
 * somewhere else.
 */

export const SLA_HOURS = {
  /** Under this, the row is simply work. */
  fine: 12,
  /** Past this, it is late. */
  warning: 24,
  /** Past this, a customer has been left waiting. */
  danger: 48,
} as const;

export type SlaLevel = 'fine' | 'warning' | 'danger';

export function slaLevel(since: Date | string, now: Date = new Date()): SlaLevel {
  const hours = (now.getTime() - new Date(since).getTime()) / 3_600_000;
  if (hours >= SLA_HOURS.danger) return 'danger';
  if (hours >= SLA_HOURS.warning) return 'warning';
  return 'fine';
}

/**
 * The rail colour for a level.
 *
 * `primary` rather than a neutral for a fresh row: a new order is not a
 * warning, but it is the most important thing on the screen, and grey would put
 * it below an expiring promotion in the visual hierarchy.
 */
export const SLA_TONE: Record<SlaLevel, 'primary' | 'warning' | 'danger'> = {
  fine: 'primary',
  warning: 'warning',
  danger: 'danger',
};

/**
 * The three urgency classes rows are grouped into (Prompt C4).
 *
 * A flat chronological list gave a three-day-old unaccepted order the same
 * weight as a three-month-old unanswered review. These say what the row COSTS:
 * a customer is waiting, or the shop's standing is, or neither.
 */
export type QueueClass = 'blocking' | 'important' | 'housekeeping';

export const QUEUE_CLASS_ORDER: QueueClass[] = ['blocking', 'important', 'housekeeping'];
