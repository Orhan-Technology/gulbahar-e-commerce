'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatOpeningHours } from '@/lib/format';
import {
  parseWeeklyHours,
  serializeWeeklyHours,
  WEEK_DAYS,
  type DayKey,
  type WeeklyHours,
} from '@/lib/opening';

/**
 * Opening hours, per day, inside the existing free-text column.
 *
 * A Kabul mall's real week is not one range repeated seven times: Friday is the
 * weekend, plenty of units shut for it, and Thursday often ends early. There is
 * no schema change available here, so the canonical string learned an ASCII
 * extension instead — `08:00-19:00;thu=08:00-13:00;fri=closed` — which the whole
 * app parses through lib/opening.ts and localises at RENDER time. Nothing about
 * a display language is ever written to the column (CLAUDE.md), and every legacy
 * single-range value keeps working untouched.
 *
 * A USUAL RANGE PLUS EXCEPTIONS, not seven independent editors. Seven pairs of
 * time inputs on a phone is a form nobody finishes, and it makes the common case
 * — same hours all week — six times more work than it was before.
 */

type DayMode = 'usual' | 'closed' | 'custom';
type DayDraft = { mode: DayMode; open: string; close: string };

const pad = (value: string) => value.padStart(2, '0');

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Canonical string → editor state. */
function toDraft(hours: string): { open: string; close: string; days: Record<DayKey, DayDraft> } {
  const parsed = parseWeeklyHours(hours);
  const base = parsed?.base ?? null;

  const days = Object.fromEntries(
    WEEK_DAYS.map((day) => {
      const override = parsed && day in parsed.overrides ? parsed.overrides[day] : undefined;
      if (override === undefined) return [day, { mode: 'usual', open: '', close: '' } as DayDraft];
      if (override === null) return [day, { mode: 'closed', open: '', close: '' } as DayDraft];
      return [
        day,
        { mode: 'custom', open: clock(override.open), close: clock(override.close) } as DayDraft,
      ];
    }),
  ) as Record<DayKey, DayDraft>;

  return {
    open: base ? clock(base.open) : '',
    close: base ? clock(base.close) : '',
    days,
  };
}

/** Editor state → canonical string, via the same serialiser the parser mirrors. */
function toCanonical(open: string, close: string, days: Record<DayKey, DayDraft>): string {
  const range = (from: string, to: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(from);
    const other = /^(\d{1,2}):(\d{2})$/.exec(to);
    if (!match || !other) return null;
    return {
      open: Number(match[1]) * 60 + Number(match[2]),
      close: Number(other[1]) * 60 + Number(other[2]),
    };
  };

  const base = range(open, close);
  const overrides: WeeklyHours['overrides'] = {};

  for (const day of WEEK_DAYS) {
    const draft = days[day];
    if (draft.mode === 'usual') continue;
    if (draft.mode === 'closed') {
      overrides[day] = null;
      continue;
    }
    const custom = range(draft.open, draft.close);
    // A half-filled custom day falls back to the usual hours rather than being
    // written as a broken segment.
    if (custom) overrides[day] = custom;
  }

  if (!base && Object.keys(overrides).length === 0) return '';
  return serializeWeeklyHours({ base, overrides });
}

export function WeeklyHoursEditor({
  value,
  onChange,
  error,
}: {
  /** The canonical string, exactly as it is stored. */
  value: string;
  onChange: (next: string) => void;
  /** Pre-translated message from the action, if the string was refused. */
  error?: string | null;
}) {
  const t = useTranslations('shopProfile.hoursEditor');
  const locale = useLocale();

  const draft = toDraft(value);

  const update = (
    next: Partial<{ open: string; close: string }>,
    days?: Record<DayKey, DayDraft>,
  ) => {
    const open = next.open ?? draft.open;
    const close = next.close ?? draft.close;
    onChange(toCanonical(open, close, days ?? draft.days));
  };

  const setDay = (day: DayKey, patch: Partial<DayDraft>) => {
    const days = { ...draft.days, [day]: { ...draft.days[day], ...patch } };
    onChange(toCanonical(draft.open, draft.close, days));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('usualLabel')}</Label>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            aria-label={t('opensAt')}
            dir="ltr"
            className="w-32"
            value={draft.open}
            onChange={(event) => update({ open: pad(event.target.value) })}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="time"
            aria-label={t('closesAt')}
            dir="ltr"
            className="w-32"
            value={draft.close}
            onChange={(event) => update({ close: pad(event.target.value) })}
          />
        </div>
        <p className="text-muted-foreground text-xs">{t('usualHint')}</p>
        {error && <p className="text-danger text-xs font-medium">{error}</p>}
      </div>

      <fieldset className="rounded-control border-border space-y-1 border p-3">
        <legend className="px-1 text-xs font-bold">{t('exceptionsLabel')}</legend>
        <p className="text-muted-foreground pb-1 text-xs">{t('exceptionsHint')}</p>

        <ul className="divide-border divide-y">
          {WEEK_DAYS.map((day) => {
            const row = draft.days[day];
            return (
              <li key={day} className="space-y-2 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-medium">{t(`days.${day}`)}</span>

                  {/*
                    A native <select>, not the styled one: three short options on
                    a phone, and the platform picker is the fastest control a
                    low-literacy user already knows how to work.
                  */}
                  <select
                    aria-label={t('modeLabel', { day: t(`days.${day}`) })}
                    className="rounded-control border-input bg-card h-9 min-w-32 border px-2 text-xs"
                    value={row.mode}
                    onChange={(event) => setDay(day, { mode: event.target.value as DayMode })}
                  >
                    <option value="usual">{t('modeUsual')}</option>
                    <option value="custom">{t('modeCustom')}</option>
                    <option value="closed">{t('modeClosed')}</option>
                  </select>

                  {row.mode === 'usual' && draft.open && draft.close && (
                    <span className="text-muted-foreground text-xs">
                      {formatOpeningHours(`${draft.open}-${draft.close}`, locale)}
                    </span>
                  )}
                </div>

                {row.mode === 'custom' && (
                  <div className="flex items-center gap-2 ps-20">
                    <Input
                      type="time"
                      dir="ltr"
                      className="h-8 w-28"
                      aria-label={t('opensAtDay', { day: t(`days.${day}`) })}
                      value={row.open}
                      onChange={(event) => setDay(day, { open: pad(event.target.value) })}
                    />
                    <span className="text-muted-foreground">—</span>
                    <Input
                      type="time"
                      dir="ltr"
                      className="h-8 w-28"
                      aria-label={t('closesAtDay', { day: t(`days.${day}`) })}
                      value={row.close}
                      onChange={(event) => setDay(day, { close: pad(event.target.value) })}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
    </div>
  );
}
