import { getLocale, getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { StretchScroll } from '@/components/motion/stretch-scroll';
import { pressable } from '@/components/motion/pressable';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Motion reference (PRD §10.6, revised).
 *
 * Both of these are normally felt rather than looked at — the stretch only on a
 * phone, the press only for 120ms — so the styleguide is the one place they can
 * be examined deliberately.
 *
 * The stretch is demonstrated in a FRAMED SCROLLER rather than on the page
 * itself, which is what makes it reviewable on a desktop: an internal scroll
 * container reaches its bound after eight rows instead of nineteen bands, and a
 * trackpad flick past that bound drives the same code path a finger does.
 */
const ROWS = 9;

export async function MotionShowcase() {
  const locale = await getLocale();
  const t = await getTranslations('styleguide');

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('motion.stretchTitle')}</h3>
        <p className="text-muted-foreground text-sm">{t('motion.stretchHint')}</p>

        <StretchScroll
          className="rounded-card border-border h-64 max-w-md border"
          contentClassName="divide-border divide-y"
        >
          {Array.from({ length: ROWS }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-4">
              <span className="rounded-pill bg-primary-50 text-primary flex h-9 w-9 shrink-0 items-center justify-center text-sm font-bold">
                {formatNumber(index + 1, locale)}
              </span>
              <span className="text-base">{t('motion.row')}</span>
            </div>
          ))}
        </StretchScroll>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('motion.pressTitle')}</h3>
        <p className="text-muted-foreground text-sm">{t('motion.pressHint')}</p>

        <div className="flex flex-wrap items-center gap-4">
          <Button>{t('motion.pressButton')}</Button>
          <Button variant="outline">{t('motion.pressOutline')}</Button>

          {/* A chip and a card, marked the same way every real one is. */}
          <span
            className={cn(
              pressable,
              'rounded-pill bg-neutral-100 px-4 py-2 text-sm font-semibold select-none',
            )}
          >
            {t('motion.pressChip')}
          </span>

          <span
            className={cn(
              pressable,
              'rounded-card bg-card shadow-card block w-40 px-4 py-6 text-sm font-semibold select-none',
            )}
          >
            {t('motion.pressCard')}
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <p className="text-muted-foreground border-border border-t pt-4 text-xs">
        {t('motion.reducedNote')}
      </p>
    </div>
  );
}
