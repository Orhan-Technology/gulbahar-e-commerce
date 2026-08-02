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
 * Hours are the canonical ASCII form that both `platform_settings` and
 * `shops.hours` store — never the localised display string. That form is now
 * either the single `HH:MM-HH:MM` range it has always been, or that range
 * followed by per-day overrides (`08:00-19:00;fri=closed`). See WeeklyHours
 * below; every legacy value parses as a base with no overrides and behaves
 * exactly as it did.
 */

export const MALL_TIME_ZONE = 'Asia/Kabul';

export type OpenState = {
  open: boolean;
  /** Minutes until opening (when closed) or until closing (when open). */
  minutesUntil: number;
  /** `HH:MM` of the boundary the countdown names, for the "opens at" copy. */
  boundary: string;
  /**
   * Set only when the shop is shut for the whole of today and the countdown
   * therefore names a boundary on a LATER day — a Friday closure is the case
   * this exists for. Callers that say "opens at ۸:۰۰" can add "on Saturday".
   */
  nextOpenDay?: DayKey;
};

export type HoursRange = { open: number; close: number };

/**
 * The Afghan week, Saturday-first — which is the working week, not a locale
 * preference. Friday is the weekend and is the day a Kabul shop is most likely
 * to keep different hours or close outright.
 */
export const WEEK_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type DayKey = (typeof WEEK_DAYS)[number];

/**
 * Per-day hours WITHOUT a schema change (CLAUDE.md: `shops.hours` is free text
 * stored canonically in ASCII and localised at render time).
 *
 * The canonical form is the existing single range, optionally followed by
 * `;`-separated per-day overrides:
 *
 *     08:00-19:00                      ← unchanged, and what every seeded row holds
 *     08:00-19:00;fri=closed           ← same week, shut on Friday
 *     08:00-19:00;thu=08:00-13:00;fri=closed
 *
 * A BASE plus OVERRIDES rather than seven independent ranges, for two reasons
 * that are both about the data already in the column: every legacy value parses
 * as a base with no overrides and keeps rendering exactly as it did, and a shop
 * that keeps one set of hours six days a week writes one range instead of six
 * identical ones. Digits stay ASCII in the column — a display string frozen into
 * the row is the bug this format is careful not to reintroduce.
 */
export type WeeklyHours = {
  /** The default range, or null when every day is set individually. */
  base: HoursRange | null;
  /** A range for that day, or null meaning CLOSED. Absent means "use base". */
  overrides: Partial<Record<DayKey, HoursRange | null>>;
};

function parseRange(value: string): HoursRange | null {
  const match = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, openHour, openMinute, closeHour, closeMinute] = match;
  const open = Number(openHour) * 60 + Number(openMinute);
  const close = Number(closeHour) * 60 + Number(closeMinute);
  if (open > 1439 || close > 1439) return null;
  return { open, close };
}

/**
 * Reads either form. Returns null when nothing in the string is a usable range,
 * which is the signal every caller already treats as "hours unknown" — never as
 * "closed", because sending someone away from an open door is the worse error.
 */
export function parseWeeklyHours(value: string | null | undefined): WeeklyHours | null {
  if (!value) return null;

  const segments = value
    .trim()
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  let base: HoursRange | null = null;
  const overrides: WeeklyHours['overrides'] = {};

  for (const [index, segment] of segments.entries()) {
    const eq = segment.indexOf('=');

    if (eq === -1) {
      // Only the FIRST segment may be a bare range; anything else is malformed
      // and is dropped rather than guessed at.
      if (index !== 0) continue;
      base = parseRange(segment);
      continue;
    }

    const day = segment.slice(0, eq).trim().toLowerCase();
    const rest = segment.slice(eq + 1).trim().toLowerCase();
    if (!(WEEK_DAYS as readonly string[]).includes(day)) continue;

    overrides[day as DayKey] = rest === 'closed' ? null : parseRange(rest);
    // A day whose range failed to parse is not a day that is closed.
    if (overrides[day as DayKey] === null && rest !== 'closed') delete overrides[day as DayKey];
  }

  if (!base && Object.keys(overrides).length === 0) return null;
  return { base, overrides };
}

const pad2 = (value: number) => String(value).padStart(2, '0');
const rangeText = (range: HoursRange) =>
  `${pad2(Math.floor(range.open / 60))}:${pad2(range.open % 60)}-${pad2(Math.floor(range.close / 60))}:${pad2(range.close % 60)}`;

/**
 * Back to the canonical string. Emits the LEGACY single-range form when there
 * are no overrides, so a shop that never touches the per-day editor keeps a
 * value indistinguishable from the one the seed wrote.
 */
export function serializeWeeklyHours(weekly: WeeklyHours): string {
  const parts: string[] = [];
  if (weekly.base) parts.push(rangeText(weekly.base));

  for (const day of WEEK_DAYS) {
    if (!(day in weekly.overrides)) continue;
    const range = weekly.overrides[day];
    parts.push(`${day}=${range === null || range === undefined ? 'closed' : rangeText(range)}`);
  }

  return parts.join(';');
}

/** Zod's guard: does this string round-trip through the canonical parser? */
export function isCanonicalHours(value: string): boolean {
  const parsed = parseWeeklyHours(value);
  if (!parsed) return false;
  // A schedule with no base must say something about at least one day, and a
  // day-only schedule that closes every day is a shop that is not trading —
  // vacation mode is the honest way to express that, not empty hours.
  return parsed.base !== null || Object.values(parsed.overrides).some((range) => range !== null);
}

/** The effective range for one day: a range, or null when the shop is shut. */
export function hoursForDay(weekly: WeeklyHours, day: DayKey): HoursRange | null {
  return day in weekly.overrides ? (weekly.overrides[day] ?? null) : weekly.base;
}

/** All seven days resolved, in Saturday-first order — what the editor renders. */
export function weeklySchedule(
  value: string | null | undefined,
): Array<{ day: DayKey; range: HoursRange | null; overridden: boolean }> | null {
  const weekly = parseWeeklyHours(value);
  if (!weekly) return null;
  return WEEK_DAYS.map((day) => ({
    day,
    range: hoursForDay(weekly, day),
    overridden: day in weekly.overrides,
  }));
}

/** Which day it is at the mall — not on the server and not for the visitor. */
export function mallDay(now: Date): DayKey {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: MALL_TIME_ZONE,
    weekday: 'short',
  }).format(now);
  return short.slice(0, 3).toLowerCase() as DayKey;
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

  const weekly = parseWeeklyHours(hours);
  if (!weekly) return null;

  const today = mallDay(now);
  const window = hoursForDay(weekly, today);
  const minutes = mallMinutes(now);

  /*
   * SHUT ALL DAY — the Friday case. The countdown then names a boundary on a
   * later day, so it also names the day; "opens at ۸:۰۰" beside a Friday
   * closure would read as "in a couple of hours" to the one person it is meant
   * to stop walking over.
   */
  if (!window) {
    const startIndex = WEEK_DAYS.indexOf(today);
    for (let ahead = 1; ahead <= 7; ahead += 1) {
      const day = WEEK_DAYS[(startIndex + ahead) % WEEK_DAYS.length];
      const next = hoursForDay(weekly, day);
      if (!next) continue;
      return {
        open: false,
        minutesUntil: ahead * 1440 + next.open - minutes,
        boundary: pad(next.open),
        nextOpenDay: day,
      };
    }
    // Every day closed: the hours say nothing useful, so say nothing.
    return null;
  }

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
