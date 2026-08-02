import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarClock } from 'lucide-react';

import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';
import { formatDate } from '@/lib/format';
import { pauseState } from '@/lib/pause';
import { cn } from '@/lib/utils';

export type PauseNoticeProps = {
  pausedUntil: Date | string | null | undefined;
  pauseNote?: LocalizedText | null;
  /** Read once on the server and handed down; never a clock read in render. */
  now: Date;
  className?: string;
};

/**
 * "Back on the 14th" — vacation mode, on the customer's side (Prompt: the
 * storefront half).
 *
 * THE TONE IS THE WHOLE DESIGN. A shop that has paused is not broken, not
 * suspended and not gone: a tenant is away for Eid or has travelled to restock,
 * and everything they have built is exactly where they left it. So this is a
 * WARM notice with a date in it, not a red error — the same visual family as
 * "closing soon", one step further along. A danger colour here would tell
 * hundreds of visitors that a shop they were about to buy from has a problem.
 *
 * IT NAMES THE DAY, because that is the one fact that turns a dead end into a
 * plan. `shops.paused_until` is a date rather than a boolean precisely so this
 * sentence can exist.
 *
 * THE SHOPKEEPER'S OWN WORDS come first when they wrote any — `pause_note` is
 * localised text and goes through `pickLocale`, so a Dari note never appears on
 * an English page as a raw JSON blob.
 *
 * Renders NOTHING when the shop is trading, including when the pause date has
 * passed but nobody has cleared it: `pauseState().overdue` means the shop is
 * back, and a stale badge that lies is worse than no badge (lib/pause.ts).
 */
export async function PauseNotice({ pausedUntil, pauseNote, now, className }: PauseNoticeProps) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.paused');

  const state = pauseState(pausedUntil, now);
  if (!state?.paused) return null;

  const note = pauseNote ? pickLocale(pauseNote, locale) : null;

  return (
    <section
      data-shop-paused
      className={cn(
        'rounded-card border-warning-border bg-warning-bg flex gap-3 border p-4',
        className,
      )}
    >
      <CalendarClock className="text-warning-fg mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <h2 className="text-warning-fg text-sm font-bold">
          {t('title', { date: formatDate(state.until, locale, 'medium') })}
        </h2>
        {/* The reassurance is not padding: the reader's next question is
            whether this shop still exists, and the answer is yes. */}
        <p className="text-warning-fg/85 text-sm leading-relaxed">{t('body')}</p>
        {note && <p className="text-warning-fg/85 text-sm leading-relaxed">«{note}»</p>}
      </div>
    </section>
  );
}

/**
 * The same fact at pill size, for the hero banner and for a directory card.
 *
 * Separate from the banner rather than a variant of it because it appears in a
 * different place in the tree — over a photograph, beside an OPEN/CLOSED pill —
 * and needs the same backdrop treatment those have.
 */
export async function PausePill({
  pausedUntil,
  now,
  className,
}: Omit<PauseNoticeProps, 'pauseNote'>) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.paused');

  const state = pauseState(pausedUntil, now);
  if (!state?.paused) return null;

  return (
    <span
      data-shop-paused-pill
      className={cn(
        'rounded-pill bg-accent-warm/95 shadow-card inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-900 backdrop-blur-sm',
        className,
      )}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {/* 'medium', never 'short': a numeric date is ambiguous across the two
          calendars this app renders (lib/format.ts). */}
      {t('pill', { date: formatDate(state.until, locale, 'medium') })}
    </span>
  );
}
