import { getLocale, getTranslations } from 'next-intl/server';

import { pickLocale } from '@/lib/db/localized';
import type { Floor } from '@/lib/db/queries/mall';
import { formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * A floor drawn as its units (Prompt C9).
 *
 * COLOUR IS STATUS, and there are only four of them: trading, waiting for
 * approval, suspended, and a gap in the numbering. A landlord scanning three
 * floors is looking for the ones that are not green, and a fifth colour would
 * make that scan slower rather than more informative.
 *
 * THE GAPS ARE DRAWN, not listed in a sentence underneath. A unit missing from
 * the middle of a row is what a vacancy looks like in a building, and it is the
 * one thing on this screen that is worth money to notice.
 *
 * Units are ordered by NUMBER, not by shop name — the plan has to read the way
 * someone walking the floor reads it.
 */
export async function FloorPlanGrid({ floor }: { floor: Floor }) {
  const locale = await getLocale();
  const t = await getTranslations('adminFloors');

  const cells = [
    ...floor.shops
      .filter((shop) => shop.unitValue !== null)
      .map((shop) => ({ unit: shop.unitValue as number, shop })),
    ...floor.vacantUnits.map((unit) => ({ unit, shop: null })),
  ].sort((a, b) => a.unit - b.unit);

  if (cells.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
      {cells.map(({ unit, shop }) => {
        const label = formatUnitNumber(String(unit), locale);

        if (!shop) {
          return (
            <span
              key={unit}
              data-unit-state="vacant"
              title={t('vacantUnit', { unit: label })}
              className="rounded-control flex h-12 items-center justify-center border border-dashed border-neutral-300 bg-neutral-50 text-2xs tabular-nums text-neutral-400"
            >
              {label}
            </span>
          );
        }

        const tone =
          shop.status === 'approved'
            ? 'border-success/30 bg-success-50 text-success-800 hover:border-success'
            : shop.status === 'pending'
              ? 'border-accent-warm/40 bg-accent-warm/10 text-neutral-800 hover:border-accent-warm'
              : 'border-border bg-neutral-100 text-neutral-500 hover:border-neutral-400';

        return (
          <Link
            key={unit}
            href={`/admin/shops/${shop.id}`}
            data-unit-state={shop.status}
            title={pickLocale(shop.name, locale)}
            className={cn(
              'rounded-control flex h-12 flex-col items-center justify-center gap-0.5 border px-1 transition-colors duration-150',
              tone,
            )}
          >
            <span className="text-2xs font-bold tabular-nums">{label}</span>
            <span className="w-full truncate text-center text-2xs leading-tight">
              {pickLocale(shop.name, locale)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
