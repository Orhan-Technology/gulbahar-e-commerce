import { getLocale, getTranslations } from 'next-intl/server';

import { pressable } from '@/components/motion/pressable';
import { pickLocale } from '@/lib/db/localized';
import type { MapFloor } from '@/lib/db/queries/mall';
import { formatNumber, formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { openState } from '@/lib/opening';
import { cn } from '@/lib/utils';

/**
 * The mall plan, drawn as its units (Prompt C11).
 *
 * NOT ARCHITECTURALLY ACCURATE, and it does not pretend to be. What a shopper
 * needs is which end of the floor to walk to and what is next door — so the
 * plan is two rows of units either side of a walkway, in unit-number order,
 * with the entrance and the stairs marked. That is legible on a phone and true
 * about which shop is where, which is the whole brief.
 *
 * CSS GRID RATHER THAN SVG. An SVG plan would need a viewBox, a text-length
 * strategy for Dari shop names, and its own RTL handling — and would still have
 * to reflow at 390px. A grid of links mirrors itself, wraps, scales its type,
 * and every unit is a real anchor with a focus ring for free.
 *
 * A UNIT NOT MATCHING THE FILTER IS DIMMED, NOT REMOVED. The plan is a map: a
 * shop disappearing because you filtered by "shoes" would change the shape of
 * the building and destroy the one thing a map is for.
 */
export async function FloorMap({
  floor,
  category,
  highlightUnit,
  now,
  mallHours,
  compact = false,
}: {
  floor: MapFloor;
  /** Category slug to emphasise; everything else dims. */
  category?: string;
  /** A unit to mark as "you are here" — the shop page's About tab uses this. */
  highlightUnit?: number | null;
  now: Date;
  mallHours: string;
  /** Drops the legend and shrinks the cells, for the shop page embed. */
  compact?: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations('floors');

  const half = Math.ceil(floor.units.length / 2);
  const rows = [floor.units.slice(0, half), floor.units.slice(half)];

  const cell = (entry: MapFloor['units'][number]) => {
    const label = formatUnitNumber(String(entry.unit), locale);

    if (!entry.shop) {
      return (
        <span
          key={entry.unit}
          data-map-unit={entry.unit}
          data-map-state="vacant"
          title={t('vacant', { unit: label })}
          /*
           * VACANT UNITS RECEDE. Twenty-seven of these surround four shops, and
           * at neutral-400 on neutral-50 the numbers were legible enough to
           * count — so the eye read the empties first and the plan looked like a
           * grid of numbers with a few coloured squares lost in it. They still
           * have to be THERE (a floor with holes in it is the truth, and the
           * gaps are how you know where a shop sits), but they are context, not
           * content: one step lighter on the number and the border.
           */
          className={cn(
            'rounded-control text-2xs flex items-center justify-center border border-dashed border-neutral-200 bg-neutral-50 tabular-nums text-neutral-300',
            compact ? 'h-11' : 'h-16',
          )}
        >
          {label}
        </span>
      );
    }

    const dimmed = Boolean(category) && entry.shop.categorySlug !== category;
    const highlighted = highlightUnit === entry.unit;
    const open = openState(entry.shop.hours, now)?.open && openState(mallHours, now)?.open;

    return (
      <Link
        key={entry.unit}
        href={`/shops/${entry.shop.slug}`}
        data-map-unit={entry.unit}
        data-map-state={highlighted ? 'highlight' : dimmed ? 'dimmed' : 'shop'}
        title={pickLocale(entry.shop.name, locale)}
        aria-current={highlighted ? 'location' : undefined}
        className={cn(
          pressable,
          'rounded-control flex flex-col items-center justify-center gap-0.5 border px-1 text-center transition-[background-color,border-color,opacity,scale] duration-150 ease-out',
          compact ? 'h-11' : 'h-16',
          highlighted
            ? 'border-primary bg-primary text-primary-foreground shadow-card font-bold'
            : dimmed
              ? 'border-border bg-card text-neutral-400 opacity-50'
              : // Occupied units CARRY the plan, so they are the loudest thing
                // on it: a filled tint and a full-strength border rather than
                // the 50-weight wash that put them barely a step above the
                // dashed empties they are meant to stand out from.
                'border-primary-300 bg-primary-100 text-primary-900 shadow-card hover:border-primary hover:bg-primary-200',
        )}
      >
        <span className="flex items-center gap-1 text-2xs font-bold tabular-nums">
          {/* A dot, not a word: the pill on the shop page says "open now" in
              full, and forty of them on one plan would be a wall of text. */}
          {open && !highlighted && (
            <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden />
          )}
          {label}
        </span>
        <span className={cn('w-full truncate leading-tight', compact ? 'text-2xs' : 'text-xs')}>
          {pickLocale(entry.shop.name, locale)}
        </span>
      </Link>
    );
  };

  return (
    <div className="space-y-2">
      <div className={cn('grid gap-1.5', compact ? 'grid-cols-5' : 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7')}>
        {rows[0].map(cell)}
      </div>

      {/* The walkway. Without it the plan is a grid of numbers, not a floor. */}
      <div className="rounded-control text-2xs flex items-center justify-between bg-neutral-100 px-3 py-1.5 text-neutral-500">
        <span>{t('entrance')}</span>
        <span className="mx-3 flex-1 border-t border-dashed border-neutral-300" aria-hidden />
        <span>{t('stairs')}</span>
      </div>

      <div className={cn('grid gap-1.5', compact ? 'grid-cols-5' : 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7')}>
        {rows[1].map(cell)}
      </div>

      {!compact && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-4 pt-1 text-2xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-success h-2 w-2 rounded-full" aria-hidden />
            {t('legendOpen')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="border-primary-300 bg-primary-100 h-3 w-3 rounded-[3px] border"
              aria-hidden
            />
            {t('legendShop')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-[3px] border border-dashed border-neutral-200 bg-neutral-50"
              aria-hidden
            />
            {t('legendVacant')}
          </span>
          <span className="ms-auto tabular-nums">
            {t('shopsOnFloor', {
              count: formatNumber(floor.units.filter((entry) => entry.shop).length, locale),
            })}
          </span>
        </div>
      )}
    </div>
  );
}
