import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { StyleguideInteractive } from '@/components/styleguide/interactive';
import {
  formatCompact,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from '@/lib/format';

/**
 * Hidden visual-regression reference for the whole build (Prompt 2.1).
 * Deliberately outside the (shop)/(dashboard)/(admin) route groups so it
 * inherits no surface chrome.
 */

const PRIMARY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const NEUTRAL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
/*
 * Written out rather than templated — Tailwind's content scanner only sees
 * literal class strings, so `text-${step}` would never be generated.
 */
const TYPE_STEPS = [
  { name: 'xs', cls: 'text-xs' },
  { name: 'sm', cls: 'text-sm' },
  { name: 'base', cls: 'text-base' },
  { name: 'lg', cls: 'text-lg' },
  { name: 'xl', cls: 'text-xl' },
  { name: '2xl', cls: 'text-2xl' },
  { name: '3xl', cls: 'text-3xl' },
] as const;
const SPACING_STEPS = [1, 2, 3, 4, 6, 8, 12, 16];

export default async function StyleguidePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('styleguide');

  return (
    <div className="mx-auto max-w-5xl space-y-12 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <LocaleSwitcher />
      </header>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.palette')}>
        <Swatches label={t('palette.primary')} name="primary" steps={PRIMARY_STEPS} />
        <Swatches label={t('palette.accent')} name="accent" steps={PRIMARY_STEPS} />
        <Swatches label={t('palette.neutral')} name="neutral" steps={NEUTRAL_STEPS} />

        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('palette.semantic')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <SemanticSwatch tone="success" label={t('palette.success')} />
            <SemanticSwatch tone="warning" label={t('palette.warning')} />
            <SemanticSwatch tone="danger" label={t('palette.danger')} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('palette.surfaces')}</h3>
          <div className="flex flex-wrap gap-3">
            {['bg-background', 'bg-card', 'bg-overlay', 'bg-muted'].map((cls) => (
              <div
                key={cls}
                className={`${cls} flex h-16 w-32 items-center justify-center rounded-card border border-border text-xs`}
              >
                <code>{cls}</code>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.typography')}>
        <p className="text-sm text-muted-foreground">{t('typography.note')}</p>
        <div className="space-y-3">
          {TYPE_STEPS.map(({ name, cls }) => (
            <div
              key={name}
              className="flex flex-wrap items-baseline gap-4 border-b border-border pb-3"
            >
              <code className="w-16 shrink-0 text-xs text-muted-foreground">text-{name}</code>
              <span className={`${cls} font-arabic`}>{t('typography.sampleFa')}</span>
              <span className={`${cls} font-latin`}>{t('typography.sampleEn')}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.numerals')}>
        <p className="text-sm text-muted-foreground">{t('numerals.note')}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <NumeralRow label={t('numerals.price')} value={formatCurrency(24500, locale)} />
          <NumeralRow label={t('numerals.count')} value={formatNumber(1234567, locale)} />
          <NumeralRow label={t('numerals.compact')} value={formatCompact(48200, locale)} />
          <NumeralRow label={t('numerals.discount')} value={formatPercent(0.25, locale)} />
          <NumeralRow label={t('numerals.date')} value={formatDate('2026-07-27', locale, 'long')} />
        </dl>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.spacing')}>
        <div className="space-y-2">
          {SPACING_STEPS.map((step) => (
            <div key={step} className="flex items-center gap-4">
              <code className="w-12 shrink-0 text-xs text-muted-foreground">{step}</code>
              <div className={`h-4 bg-primary-600`} style={{ width: `${step * 4}px` }} />
              <span className="text-xs text-muted-foreground">{step * 4}px</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.radiusElevation')}>
        <div className="flex flex-wrap gap-4">
          <div className="flex h-20 w-32 items-center justify-center rounded-card border border-border bg-card text-xs">
            rounded-card
          </div>
          <div className="flex h-20 w-32 items-center justify-center rounded-control border border-border bg-card text-xs">
            rounded-control
          </div>
          <div className="flex h-20 w-32 items-center justify-center rounded-pill border border-border bg-card text-xs">
            rounded-pill
          </div>
          <div className="flex h-20 w-32 items-center justify-center rounded-card bg-card text-xs shadow-card">
            shadow-card
          </div>
          <div className="flex h-20 w-32 items-center justify-center rounded-card bg-card text-xs shadow-overlay">
            shadow-overlay
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.buttons')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('buttons.default')}</Button>
          <Button variant="accent">{t('buttons.accent')}</Button>
          <Button variant="secondary">{t('buttons.secondary')}</Button>
          <Button variant="outline">{t('buttons.outline')}</Button>
          <Button variant="ghost">{t('buttons.ghost')}</Button>
          <Button variant="destructive">{t('buttons.destructive')}</Button>
          <Button variant="link">{t('buttons.link')}</Button>
          <Button disabled>{t('buttons.disabled')}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{t('buttons.small')}</Button>
          <Button size="default">{t('buttons.medium')}</Button>
          <Button size="lg">{t('buttons.large')}</Button>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.badges')}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{t('badges.default')}</Badge>
          <Badge variant="accent">{t('badges.sponsored')}</Badge>
          <Badge variant="secondary">{t('badges.secondary')}</Badge>
          <Badge variant="success">{t('badges.success')}</Badge>
          <Badge variant="warning">{t('badges.warning')}</Badge>
          <Badge variant="destructive">{t('badges.destructive')}</Badge>
          <Badge variant="outline">{t('badges.outline')}</Badge>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.interactive')}>
        <StyleguideInteractive />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('sections.inputsCards')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Input placeholder={t('inputs.placeholder')} />
            <Input placeholder={t('inputs.disabled')} disabled />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('card.title')}</CardTitle>
              <CardDescription>{t('card.description')}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">{t('card.body')}</CardContent>
          </Card>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Swatches({ label, name, steps }: { label: string; name: string; steps: number[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{label}</h3>
      <div className="flex flex-wrap gap-1">
        {steps.map((step) => (
          <div key={step} className="w-16">
            <div
              className="h-12 rounded-control border border-border"
              style={{ backgroundColor: `hsl(var(--${name}-${step}))` }}
            />
            <code className="mt-1 block text-center text-xs text-muted-foreground">{step}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function SemanticSwatch({
  tone,
  label,
}: {
  tone: 'success' | 'warning' | 'danger';
  label: string;
}) {
  const solid = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  const fg = { success: 'text-success-fg', warning: 'text-warning-fg', danger: 'text-danger-fg' }[
    tone
  ];
  const tint = { success: 'bg-success-bg', warning: 'bg-warning-bg', danger: 'bg-danger-bg' }[tone];
  const border = {
    success: 'border-success-border',
    warning: 'border-warning-border',
    danger: 'border-danger-border',
  }[tone];
  const text = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tone];

  return (
    <div className="space-y-1">
      <div className={`${solid} ${fg} rounded-control px-3 py-2 text-xs font-medium`}>{label}</div>
      <div className={`${tint} ${border} ${text} rounded-control border px-3 py-2 text-xs`}>
        {label}
      </div>
    </div>
  );
}

function NumeralRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-control border border-border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}
