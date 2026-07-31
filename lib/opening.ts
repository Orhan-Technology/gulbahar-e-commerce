/**
 * Is the mall open right now? (Prompt C8)
 *
 * The pill on a shop hero answers a question a delivery-only marketplace never
 * has to: can I walk over there. That makes the answer worth getting right in
 * two ways that are easy to get wrong.
 *
 * ONE — the TIMEZONE is the mall's, not the server's and not the visitor's. A
 * demo laptop in Kabul and a demo laptop in Berlin must show the same pill,
 * because the fact being stated is about a building. `Asia/Kabul` is +04:30 —
 * a half-hour offset, which is exactly the kind of thing a hand-rolled
 * `getHours() + 4` gets wrong. `Intl.DateTimeFormat` with an explicit
 * `timeZone` is the only version that stays correct.
 *
 * TWO — `now` is a PARAMETER, never read from the clock in here. This is
 * called during render, and React 19 forbids impure calls there (CLAUDE.md);
 * the server page reads the clock once and passes it down, which also means a
 * check script can assert the closed state without waiting until evening.
 *
 * Hours are the canonical ASCII `HH:MM-HH:MM` that both `platform_settings` and
 * `shops.hours` store — never the localised display string.
 */

export const MALL_TIME_ZONE = 'Asia/Kabul';

export type OpenState = {
  open: boolean;
  /** Minutes until opening (when closed) or until closing (when open). */
  minutesUntil: number;
  /** `HH:MM` of the boundary the countdown names, for the "opens at" copy. */
  boundary: string;
};

function parseHours(hours: string): { open: number; close: number } | null {
  const match = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(hours.trim());
  if (!match) return null;

  const [, openHour, openMinute, closeHour, closeMinute] = match;
  return {
    open: Number(openHour) * 60 + Number(openMinute),
    close: Number(closeHour) * 60 + Number(closeMinute),
  };
}

/** Minutes since midnight in the mall's timezone. */
function mallMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MALL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

const pad = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Returns null when the hours string is missing or unparseable, and the caller
 * renders no pill at all — a shop with unknown hours is not a CLOSED shop, and
 * saying so would send someone away from a door that is open.
 */
export function openState(hours: string | null | undefined, now: Date): OpenState | null {
  if (!hours) return null;

  const window = parseHours(hours);
  if (!window) return null;

  const minutes = mallMinutes(now);

  // A window that wraps past midnight (22:00-02:00) is two intervals, not one.
  const open =
    window.close > window.open
      ? minutes >= window.open && minutes < window.close
      : minutes >= window.open || minutes < window.close;

  if (open) {
    const untilClose = (window.close - minutes + 1440) % 1440;
    return { open: true, minutesUntil: untilClose, boundary: pad(window.close) };
  }

  const untilOpen = (window.open - minutes + 1440) % 1440;
  return { open: false, minutesUntil: untilOpen, boundary: pad(window.open) };
}

/** "Closing soon" deserves a different tone from "open" — one hour of warning. */
export const CLOSING_SOON_MINUTES = 60;
