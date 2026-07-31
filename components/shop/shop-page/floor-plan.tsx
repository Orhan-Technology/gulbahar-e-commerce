import { getLocale, getTranslations } from 'next-intl/server';

import { formatNumber, formatUnitNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A labelled plan of the floor, with this shop's unit lit up (Prompt C8).
 *
 * NOT A MAP, and it does not pretend to be one. C11 builds the real interactive
 * floor map from unit data; until then this is a schematic — two rows of units
 * either side of a walkway, with the entrance and the stairs marked — whose
 * only job is to answer "which end of the floor am I walking to". That is
 * genuinely most of what a shopper needs, and it is honest about being a
 * diagram rather than a survey.
 *
 * The unit numbers ARE derived from the real one: floor 2 unit 214 draws a
 * strip of units around 214 rather than a fixed 201–220, so the highlighted
 * unit is never the only plausible number on the plan. Neighbouring units are
 * unlabelled placeholders — inventing names for shops that may not exist would
 * be fabricating data on a page whose whole claim is that the mall is real.
 */
export async function FloorPlan({
  floor,
  unitNumber,
}: {
  floor: number;
  unitNumber: string | null;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.about');

  const parsed = Number(unitNumber);
  if (!unitNumber || Number.isNaN(parsed)) return null;

  // Nine units centred on this one, clamped to the floor's own hundred block.
  const block = Math.floor(parsed / 100) * 100;
  const start = Math.max(block + 1, parsed - 4);
  const units = Array.from({ length: 9 }, (_, index) => start + index);
  const half = Math.ceil(units.length / 2);

  const cell = (unit: number) =>
    cn(
      'rounded-control flex h-11 items-center justify-center border text-2xs font-medium tabular-nums transition-colors',
      unit === parsed
        ? 'border-primary bg-primary text-primary-foreground font-bold shadow-card'
        : 'border-border bg-neutral-50 text-neutral-400',
    );

  return (
    <figure className="rounded-card border-border bg-card space-y-3 border p-4">
      <figcaption className="text-sm font-bold">
        {t('planTitle', { floor: formatNumber(floor, locale) })}
      </figcaption>

      <div className="space-y-2">
        <div className="grid grid-cols-5 gap-1.5">
          {units.slice(0, half).map((unit) => (
            <div key={unit} className={cell(unit)} aria-hidden={unit !== parsed}>
              {formatUnitNumber(String(unit), locale)}
            </div>
          ))}
        </div>

        {/* The walkway. A plan without one reads as a grid of numbers. */}
        <div className="rounded-control flex items-center justify-between bg-neutral-100 px-3 py-1.5 text-2xs text-neutral-500">
          <span>{t('planEntrance')}</span>
          <span className="border-t border-dashed border-neutral-300 flex-1 mx-3" aria-hidden />
          <span>{t('planStairs')}</span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {units.slice(half).map((unit) => (
            <div key={unit} className={cell(unit)} aria-hidden={unit !== parsed}>
              {formatUnitNumber(String(unit), locale)}
            </div>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t('planHint', {
          floor: formatNumber(floor, locale),
          unit: formatUnitNumber(unitNumber, locale),
        })}
      </p>
    </figure>
  );
}
