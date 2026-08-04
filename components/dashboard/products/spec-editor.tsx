'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { specTemplateFor } from '@/lib/product-templates';
import { cn } from '@/lib/utils';

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
 *
 * TWO THINGS ARE HIDDEN BY DEFAULT, and both were noise for this persona:
 *
 *   - THE ENGLISH COLUMN. It doubled the height of the longest section of the
 *     form for a language most tenants here do not write. One switch, shared
 *     with the features editor below, brings it back.
 *   - THE TECHNICAL KEY. A template row rendered its Dari label and its key
 *     with nothing between them — «برندbrand», «ظرفیتcapacity» — which is not a
 *     label, it is a bug that looks like a typo. The key is machinery: it
 *     exists so two shops describe a phone with the same vocabulary, and a
 *     shopkeeper never needs to read it. It appears with the English fields,
 *     properly separated, for whoever is filling in both.
 */
export function SpecEditor({
  categorySlug,
  rows,
  onChange,
  showEnglish,
  onShowEnglishChange,
}: {
  categorySlug: string | null;
  rows: SpecRowValue[];
  onChange: (next: SpecRowValue[]) => void;
  showEnglish: boolean;
  onShowEnglishChange: (next: boolean) => void;
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

        <div className="flex items-center gap-3">
          {missingFromTemplate.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={applyTemplate}>
              <Sparkles />
              {t('specsUseTemplate')}
            </Button>
          )}
          <EnglishToggle checked={showEnglish} onChange={onShowEnglishChange} id="specs-english" />
        </div>
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
                    <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
                      {row.labelFa}
                      {/* Machinery, and only for whoever is filling in both
                          languages. Never glued to the label again. */}
                      {showEnglish && (
                        <span
                          className="rounded-control text-2xs text-muted-foreground hidden bg-neutral-100 px-1.5 py-0.5 font-normal sm:inline"
                          dir="ltr"
                        >
                          {row.key}
                        </span>
                      )}
                    </p>
                  ) : (
                    <div className={cn('grid gap-2', showEnglish && 'sm:grid-cols-3')}>
                      {showEnglish && (
                        /*
                         * GONE ENTIRELY ON A PHONE (Prompt: software leaking
                         * through the wallpaper).
                         *
                         * «کلید مشخصه فقط می‌تواند حروف انگلیسی باشد» is the
                         * database explaining itself to a shopkeeper standing
                         * behind a counter, and the field it belongs to has no
                         * meaning they can act on — the key exists so two shops
                         * describe a phone with the same vocabulary, and every
                         * row that reaches this form already has one (from the
                         * category template, or auto-assigned below). On a
                         * phone the honest answer is that this control is not
                         * for them, so `hidden sm:block` and not a smaller
                         * font. Nothing is lost: a hidden key keeps whatever
                         * value it already had.
                         */
                        <div className="hidden space-y-1 sm:block">
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
                      )}
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
                      {showEnglish && (
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
                      )}
                    </div>
                  )}

                  <div className={cn('grid gap-2', showEnglish && 'sm:grid-cols-2')}>
                    <div className="space-y-1">
                      <Label htmlFor={`spec-value-fa-${index}`} className="text-2xs">
                        {showEnglish ? t('specValueFa') : t('specValue')}
                      </Label>
                      <Input
                        id={`spec-value-fa-${index}`}
                        value={row.valueFa}
                        onChange={(event) => update(index, { valueFa: event.target.value })}
                      />
                    </div>
                    {showEnglish && (
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
                    )}
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

      {/*
        ADD-YOUR-OWN-ROW IS A DESK JOB, and on a phone it is hidden with the
        rest of the machinery: a hand-added row is the one kind that needs a
        label typed from nothing and, on a wider screen, a key. On a phone the
        category TEMPLATE is the only way rows appear — which is also the shape
        that keeps two shops describing a phone with the same vocabulary, so the
        narrow screen quietly enforces the thing the wide one only encourages.
      */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() =>
          onChange([
            ...rows,
            {
              /*
               * AUTO-ASSIGNED, because the key field is hidden by default and a
               * row without one is dropped on save. It cannot be derived from
               * the Dari label — the column is ASCII — so it is a counter, and
               * a shopkeeper who never opens the English fields never learns
               * that this column exists.
               */
              key: nextCustomKey(rows),
              labelFa: '',
              labelEn: '',
              valueFa: '',
              valueEn: '',
              fromTemplate: false,
            },
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
  showEnglish,
  onShowEnglishChange,
}: {
  features: FeatureValue[];
  onChange: (next: FeatureValue[]) => void;
  /** Shared with the spec editor above — one switch governs both sections. */
  showEnglish: boolean;
  onShowEnglishChange: (next: boolean) => void;
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">{t('featuresHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('featuresHint')}</p>
        </div>
        <EnglishToggle checked={showEnglish} onChange={onShowEnglishChange} id="features-english" />
      </div>

      <ul className="space-y-2">
        {features.map((feature, index) => (
          <li key={index} className="rounded-control border-border border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className={cn('grid gap-2', showEnglish && 'sm:grid-cols-2')}>
                  <div className="space-y-1">
                    <Label htmlFor={`feature-title-fa-${index}`} className="text-2xs">
                      {showEnglish ? t('featureTitleFa') : t('featureTitle')}
                    </Label>
                    <Input
                      id={`feature-title-fa-${index}`}
                      value={feature.titleFa}
                      onChange={(event) => update(index, { titleFa: event.target.value })}
                    />
                  </div>
                  {showEnglish && (
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
                  )}
                </div>

                <div className={cn('grid gap-2', showEnglish && 'sm:grid-cols-2')}>
                  <div className="space-y-1">
                    <Label htmlFor={`feature-body-fa-${index}`} className="text-2xs">
                      {showEnglish ? t('featureBodyFa') : t('featureBody')}
                    </Label>
                    <Input
                      id={`feature-body-fa-${index}`}
                      value={feature.bodyFa}
                      onChange={(event) => update(index, { bodyFa: event.target.value })}
                    />
                  </div>
                  {showEnglish && (
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
                  )}
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

/**
 * The one switch that reveals English across both editors.
 *
 * Phrased as a QUESTION («انگلیسی هم دارید؟») rather than as a setting: the
 * honest answer for most tenants in this mall is no, and a label that asks it
 * makes leaving it off feel like an answer instead of a missing step.
 */
function EnglishToggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id: string;
}) {
  const t = useTranslations('shopProducts.form');

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-xs font-medium text-neutral-600">
        {t('englishToggle')}
      </Label>
    </div>
  );
}

/**
 * A key for a hand-added row, unique within the rows already there.
 *
 * ASCII by necessity — the column is a machine key shared across shops — and a
 * counter rather than a slug of the Dari label, because there is no honest
 * transliteration and a wrong one is worse than a number.
 */
function nextCustomKey(rows: SpecRowValue[]): string {
  const taken = new Set(rows.map((row) => row.key));
  let index = rows.length + 1;
  while (taken.has(`custom${index}`)) index += 1;
  return `custom${index}`;
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
