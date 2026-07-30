/**
 * The console's date range, in one place (Prompt C3).
 *
 * Every metric on an overview or a report obeys the SAME window, and the window
 * lives in the URL — `?range=30d` — so a shopkeeper can send a colleague the
 * exact view they are looking at, and the back button steps through ranges the
 * way it steps through anything else.
 *
 * The comparison period is DERIVED from the window rather than configured
 * separately: it is always the equally-long stretch immediately before it. That
 * is what makes "▲ 12%" mean something, and it is the rule C2 exists to
 * enforce — a value and its delta come from one helper or they eventually
 * disagree.
 *
 * No `'use client'`: the range is parsed on the server and the control that
 * changes it is a client component, and a constant exported from a client
 * module reaches a server component as a reference rather than a value
 * (CLAUDE.md).
 */

export type ConsoleRangeKey = '7d' | '30d' | '90d';

/**
 * The three windows, as a UNION rather than `number`.
 *
 * lib/db/queries/admin-reports.ts already types its period as `7 | 30 | 90`,
 * and matching it means the range flows into those queries without a cast — and
 * that a fourth range cannot be added here without the report queries being
 * taught about it, which is the right place for that conversation.
 */
export type ConsoleRangeDays = 7 | 30 | 90;

export const CONSOLE_RANGES: Array<{ key: ConsoleRangeKey; days: ConsoleRangeDays }> = [
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
];

/** Thirty days is the default: long enough to have a shape, short enough to act on. */
export const DEFAULT_RANGE: ConsoleRangeKey = '30d';

export type ConsoleRange = {
  key: ConsoleRangeKey;
  days: ConsoleRangeDays;
  /** Inclusive start of the window, at midnight UTC. */
  start: Date;
  /** Inclusive start of the equally-long window before it. */
  previousStart: Date;
};

/**
 * Parses `?range=` into a window.
 *
 * Anything unrecognised falls back to the default rather than erroring: a URL
 * is a thing people edit and paste, and a console that 500s on `?range=lol` is
 * worse than one that shows thirty days.
 *
 * The clock is read HERE, on the server, and passed down — a client component
 * may not call `new Date()` during render (React 19 purity, CLAUDE.md).
 */
export function parseConsoleRange(value: string | undefined, now: Date = new Date()): ConsoleRange {
  const match = CONSOLE_RANGES.find((range) => range.key === value);
  const { key, days } = match ?? CONSOLE_RANGES.find((range) => range.key === DEFAULT_RANGE)!;

  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const start = new Date(startOfToday);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const previousStart = new Date(start);
  previousStart.setUTCDate(previousStart.getUTCDate() - days);

  return { key, days, start, previousStart };
}
