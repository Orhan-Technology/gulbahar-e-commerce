'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { specTemplateFor } from '@/lib/product-templates';

export type SpecRowValue = {
  key: string;
  labelFa: string;
  labelEn: string;
  valueFa: string;
  valueEn: string;
  group?: string;
  /** UI only: a template row's key and label are fixed, a custom row's are not. */
  fromTemplate: boolean;
};

export type FeatureValue = {
  titleFa: string;
  titleEn: string;
  bodyFa: string;
  bodyEn: string;
};

/**
 * Specifications editor (Prompt P1).
 *
 * The category TEMPLATE is offered rather than imposed. Pressing "use the
 * template" fills the keys a mobile phone or a pair of shoes is expected to
 * carry, so two shops describe the same kind of product with the same
 * vocabulary — which is the only reason the comparison table can line products
 * up. A shopkeeper can still add rows of their own, and those carry their own
 * label because there is no message key to look one up from.
 *
 * The template is offered by a BUTTON rather than filled automatically on a
 * category change. Auto-filling would mean writing state from an effect, which
 * React 19 forbids outright (CLAUDE.md), and — more to the point — it would
 * silently overwrite rows a shopkeeper had already typed.
 *
 * A row with no Dari value is dropped on save, not rejected: filling six of
 * eight template rows is a normal thing to do, and an error message for the two
 * left blank would teach shopkeepers to delete the rows instead.
 */
export function SpecEditor({
  categorySlug,
  rows,
  onChange,
}: {
  categorySlug: string | null;
  rows: SpecRowValue[];
  onChange: (next: SpecRowValue[]) => void;
}) {
  const t = useTranslations('shopProducts.form');
  const template = specTemplateFor(categorySlug);

  const missingFromTemplate = template.filter(
    (entry) => !rows.some((row) => row.key === entry.key),
  );

  function applyTemplate() {
    onChange([
      ...rows,
      ...missingFromTemplate.map((entry) => ({
        key: entry.key,
        labelFa: entry.label.fa,
        labelEn: entry.label.en ?? '',
        valueFa: '',
        valueEn: '',
        group: entry.group,
        fromTemplate: true,
      })),
    ]);
  }

  function update(index: number, patch: Partial<SpecRowValue>) {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">{t('specsHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('specsHint')}</p>
        </div>

        {missingFromTemplate.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={applyTemplate}>
            <Sparkles />
            {t('specsUseTemplate')}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-control bg-neutral-50 p-3 text-xs text-neutral-600">
          {categorySlug && template.length > 0 ? t('specsEmptyWithTemplate') : t('specsEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={`${row.key}-${index}`} className="rounded-control border-border border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  {row.fromTemplate ? (
                    <p className="text-sm font-medium">
                      {row.labelFa}
                      <span className="text-muted-foreground ms-2 text-xs" dir="ltr">
                        {row.key}
                      </span>
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor={`spec-key-${index}`} className="text-2xs">
                          {t('specKey')}
                        </Label>
                        <Input
                          id={`spec-key-${index}`}
                          value={row.key}
                          dir="ltr"
                          onChange={(event) =>
                            update(index, { key: event.target.value.replace(/[^a-zA-Z0-9]/g, '') })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`spec-label-fa-${index}`} className="text-2xs">
                          {t('specLabelFa')}
                        </Label>
                        <Input
                          id={`spec-label-fa-${index}`}
                          value={row.labelFa}
                          onChange={(event) => update(index, { labelFa: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`spec-label-en-${index}`} className="text-2xs">
                          {t('specLabelEn')}
                        </Label>
                        <Input
                          id={`spec-label-en-${index}`}
                          value={row.labelEn}
                          dir="ltr"
                          onChange={(event) => update(index, { labelEn: event.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`spec-value-fa-${index}`} className="text-2xs">
                        {t('specValueFa')}
                      </Label>
                      <Input
                        id={`spec-value-fa-${index}`}
                        value={row.valueFa}
                        onChange={(event) => update(index, { valueFa: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`spec-value-en-${index}`} className="text-2xs">
                        {t('specValueEn')}
                      </Label>
                      <Input
                        id={`spec-value-en-${index}`}
                        value={row.valueEn}
                        dir="ltr"
                        onChange={(event) => update(index, { valueEn: event.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <RowControls
                  onUp={() => move(index, -1)}
                  onDown={() => move(index, 1)}
                  onRemove={() => onChange(rows.filter((_, position) => position !== index))}
                  upLabel={t('moveUp')}
                  downLabel={t('moveDown')}
                  removeLabel={t('removeRow')}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          onChange([
            ...rows,
            { key: '', labelFa: '', labelEn: '', valueFa: '', valueEn: '', fromTemplate: false },
          ])
        }
      >
        <Plus />
        {t('addSpecRow')}
      </Button>
    </section>
  );
}

/**
 * Features editor (Prompt P1) — the bulleted selling points.
 *
 * Deliberately capped in the UI at what the product page shows well. A list of
 * twelve "features" is a description in disguise, and the page collapses past
 * four anyway.
 */
export function FeatureEditor({
  features,
  onChange,
}: {
  features: FeatureValue[];
  onChange: (next: FeatureValue[]) => void;
}) {
  const t = useTranslations('shopProducts.form');

  function update(index: number, patch: Partial<FeatureValue>) {
    onChange(features.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= features.length) return;
    const next = [...features];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div>
        <h2 className="text-sm font-bold">{t('featuresHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('featuresHint')}</p>
      </div>

      <ul className="space-y-2">
        {features.map((feature, index) => (
          <li key={index} className="rounded-control border-border border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`feature-title-fa-${index}`} className="text-2xs">
                      {t('featureTitleFa')}
                    </Label>
                    <Input
                      id={`feature-title-fa-${index}`}
                      value={feature.titleFa}
                      onChange={(event) => update(index, { titleFa: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`feature-title-en-${index}`} className="text-2xs">
                      {t('featureTitleEn')}
                    </Label>
                    <Input
                      id={`feature-title-en-${index}`}
                      value={feature.titleEn}
                      dir="ltr"
                      onChange={(event) => update(index, { titleEn: event.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`feature-body-fa-${index}`} className="text-2xs">
                      {t('featureBodyFa')}
                    </Label>
                    <Input
                      id={`feature-body-fa-${index}`}
                      value={feature.bodyFa}
                      onChange={(event) => update(index, { bodyFa: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`feature-body-en-${index}`} className="text-2xs">
                      {t('featureBodyEn')}
                    </Label>
                    <Input
                      id={`feature-body-en-${index}`}
                      value={feature.bodyEn}
                      dir="ltr"
                      onChange={(event) => update(index, { bodyEn: event.target.value })}
                    />
                  </div>
                </div>
              </div>

              <RowControls
                onUp={() => move(index, -1)}
                onDown={() => move(index, 1)}
                onRemove={() => onChange(features.filter((_, position) => position !== index))}
                upLabel={t('moveUp')}
                downLabel={t('moveDown')}
                removeLabel={t('removeRow')}
              />
            </div>
          </li>
        ))}
      </ul>

      {features.length < 6 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange([...features, { titleFa: '', titleEn: '', bodyFa: '', bodyEn: '' }])
          }
        >
          <Plus />
          {t('addFeature')}
        </Button>
      )}
    </section>
  );
}

/** Reorder and remove, shared by both editors so the controls cannot diverge. */
function RowControls({
  onUp,
  onDown,
  onRemove,
  upLabel,
  downLabel,
  removeLabel,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  upLabel: string;
  downLabel: string;
  removeLabel: string;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <Button type="button" variant="ghost" size="icon" onClick={onUp} aria-label={upLabel}>
        <ChevronUp />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDown} aria-label={downLabel}>
        <ChevronDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={removeLabel}
        className="hover:text-danger text-neutral-500"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
