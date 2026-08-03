'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { cn } from '@/lib/utils';

export type SpecRow = {
  key: string;
  label: string;
  value: string;
  group?: string;
};

const VISIBLE_ROWS = 8;
/** Below this many rows, group chips are noise rather than navigation. */
const CHIP_THRESHOLD = 12;

/**
 * The product's specification table (PRD §5.2, Prompt P3).
 *
 * A definition list, not a grid of cards: a spec sheet is read by scanning the
 * label column, and anything that breaks that column into boxes makes the scan
 * slower. Label muted, value strong, no zebra striping — the rule is one rule
 * per row, and stripes add a second visual system that says nothing.
 *
 * Rows keep the order the shop entered them. "Screen, storage, memory, battery"
 * reads as a spec sheet; alphabetical reads as a database dump.
 *
 * COLLAPSED PAST EIGHT ROWS, with the height animated rather than snapped —
 * `grid-template-rows` from `0fr` to `1fr` is the one transition that animates
 * to intrinsic height without measuring anything in JavaScript.
 *
 * GROUP CHIPS appear only past twelve rows. On a phone with five specs, a chip
 * bar is a control that filters nothing.
 */
export function SpecTable({
  rows,
  groups,
}: {
  rows: SpecRow[];
  /** Localised group names, in template order. */
  groups: Array<{ key: string; label: string }>;
}) {
  const t = useTranslations('product');
  const [expanded, setExpanded] = React.useState(false);
  const [group, setGroup] = React.useState<string | null>(null);

  if (rows.length === 0) return null;

  const showChips = rows.length > CHIP_THRESHOLD && groups.length > 1;
  const filtered = group ? rows.filter((row) => row.group === group) : rows;
  const collapsible = filtered.length > VISIBLE_ROWS;
  const head = collapsible ? filtered.slice(0, VISIBLE_ROWS) : filtered;
  const tail = collapsible ? filtered.slice(VISIBLE_ROWS) : [];

  return (
    <section className="space-y-4" aria-labelledby="specs-heading">
      <h2 id="specs-heading" className="text-foreground text-xl font-bold">
        {t('specsHeading')}
      </h2>

      {showChips && (
        <div className="flex flex-wrap gap-2">
          <GroupChip active={group === null} onClick={() => setGroup(null)}>
            {t('specsAllGroups')}
          </GroupChip>
          {groups.map((entry) => (
            <GroupChip
              key={entry.key}
              active={group === entry.key}
              onClick={() => setGroup(entry.key)}
            >
              {entry.label}
            </GroupChip>
          ))}
        </div>
      )}

      <div className="rounded-card border-border overflow-hidden border">
        <dl className="divide-border divide-y">
          {head.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </dl>

        {/* The tail stays MOUNTED and collapses to zero height, so opening it
            animates instead of appearing, and a browser find-in-page still
            reaches the rows. */}
        {tail.length > 0 && (
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
              <dl className="divide-border divide-y border-t border-border">
                {tail.map((row) => (
                  <Row key={row.key} row={row} />
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className={cn(
            pressable,
            'text-primary rounded-control inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-semibold transition-[background-color,scale] duration-150 hover:bg-neutral-100',
          )}
          aria-expanded={expanded}
        >
          {expanded ? t('specsShowLess') : t('specsShowAll')}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
            aria-hidden
          />
        </button>
      )}
    </section>
  );
}

function Row({ row }: { row: SpecRow }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-4 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <dt className="text-sm text-neutral-500">{row.label}</dt>
      {/* `<bdi>` on the VALUE, not the row. A spec value is the one cell that
          is routinely in the other script — "Super Retina XDR", "M, L, XL" —
          and left un-isolated its punctuation resolves against the Dari around
          it, so a comma-separated list of Latin tokens renders back to front. */}
      <dd className="text-foreground text-sm font-semibold">
        <bdi>{row.value}</bdi>
      </dd>
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        pressable,
        'rounded-pill border px-3.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out',
        active
          ? 'border-primary bg-primary text-primary-foreground font-semibold'
          : 'border-border bg-card hover:border-primary',
      )}
    >
      {children}
    </button>
  );
}
