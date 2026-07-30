'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { cn } from '@/lib/utils';

export type FeatureItem = { title: string; body: string };

/** Four is what fits above the fold on a phone without pushing the specs away. */
const VISIBLE_FEATURES = 4;

/**
 * The product's selling points (Prompt P1/P3).
 *
 * Separate from the description on purpose. The description is prose a person
 * reads once; these are the four or five claims a buyer scans for, and putting
 * them in one paragraph means nobody finds the one they came for.
 *
 * Two columns from `sm`, one on a phone — a two-column list on a 390px screen
 * gives each item about twenty characters per line, which reads worse than the
 * paragraph it replaced.
 */
export function FeatureList({ features }: { features: FeatureItem[] }) {
  const t = useTranslations('product');
  const [expanded, setExpanded] = React.useState(false);

  if (features.length === 0) return null;

  const collapsible = features.length > VISIBLE_FEATURES;
  const head = collapsible ? features.slice(0, VISIBLE_FEATURES) : features;
  const tail = collapsible ? features.slice(VISIBLE_FEATURES) : [];

  return (
    <section className="space-y-4" aria-labelledby="features-heading">
      <h2 id="features-heading" className="text-foreground text-xl font-bold">
        {t('featuresHeading')}
      </h2>

      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {head.map((feature) => (
          <Feature key={feature.title} feature={feature} />
        ))}
      </ul>

      {tail.length > 0 && (
        <>
          {/* Mounted and collapsed to zero height, so opening animates to the
              intrinsic height without JavaScript measuring anything. */}
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
              <ul className="grid gap-x-8 gap-y-4 pt-4 sm:grid-cols-2">
                {tail.map((feature) => (
                  <Feature key={feature.title} feature={feature} />
                ))}
              </ul>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className={cn(
              pressable,
              'text-primary rounded-control inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-semibold transition-[background-color,scale] duration-150 hover:bg-neutral-100',
            )}
            aria-expanded={expanded}
          >
            {expanded ? t('featuresShowLess') : t('featuresShowAll')}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
              aria-hidden
            />
          </button>
        </>
      )}
    </section>
  );
}

function Feature({ feature }: { feature: FeatureItem }) {
  return (
    <li className="flex gap-3">
      <span className="rounded-pill bg-success-bg text-success mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <Check className="h-3 w-3" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-bold">{feature.title}</span>
        <span className="block text-sm leading-relaxed text-neutral-600">{feature.body}</span>
      </span>
    </li>
  );
}
