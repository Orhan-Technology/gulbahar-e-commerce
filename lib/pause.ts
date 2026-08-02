/**
 * Vacation mode, derived from `shops.paused_until` (Prompt: the missing escape
 * hatch).
 *
 * A tenant who is ill, travelling to restock, or shut for Eid could previously
 * only unpublish products one at a time — losing every listing's position, and
 * with no way to tell a customer WHY the shop had emptied. Pausing keeps the
 * shop and its catalogue exactly where they are and changes one thing: it
 * cannot take an order today.
 *
 * A DATE rather than a boolean, so the storefront can say when the shop is back
 * and so a shopkeeper who forgets to return is not invisible forever — once the
 * date passes the shop is trading again on its own, and the dashboard says so.
 *
 * `now` is always a parameter: this is read during render and React 19 forbids
 * a clock read there (CLAUDE.md).
 */

export type PauseState = {
  /** Not taking orders right now. */
  paused: boolean;
  /** The moment trading resumes — the "back on" date the storefront names. */
  until: Date;
  /**
   * The date has passed, so the shop IS trading, but nobody has cleared the
   * pause. The dashboard nags on this rather than leaving a stale banner: the
   * shopkeeper's mental model is "I am away until Thursday", and on Friday they
   * need to be told they are back rather than shown a badge that lies.
   */
  overdue: boolean;
};

export function pauseState(
  pausedUntil: Date | string | null | undefined,
  now: Date,
): PauseState | null {
  if (!pausedUntil) return null;
  const until = pausedUntil instanceof Date ? pausedUntil : new Date(pausedUntil);
  if (Number.isNaN(until.getTime())) return null;

  const paused = until.getTime() > now.getTime();
  return { paused, until, overdue: !paused };
}

/** Longest pause the dashboard will set in one go — half a year (PRD demo scale). */
export const MAX_PAUSE_DAYS = 180;
