'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Download, FileUp, PlusCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  confirmImport,
  parseImport,
  type ImportRow,
  type ParseResult,
} from '@/lib/actions/product-import';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useRouter as useLocaleRouter } from '@/lib/i18n/navigation';

/**
 * Bulk import wizard (PRD §6.2).
 *
 * Three states in one component — choose file, review, done — because the review
 * table is the whole point: the shopkeeper sees exactly which rows will be created,
 * which will overwrite an existing product, and why the rest were rejected, before
 * anything is written.
 */
export function ImportWizard({ template }: { template: { header: string; sample: string[] } }) {
  const t = useTranslations('shopProducts.importWizard');
  const locale = useLocale();
  const router = useRouter();
  const localeRouter = useLocaleRouter();

  const [result, setResult] = React.useState<ParseResult | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function downloadTemplate() {
    /*
     * Built in the browser rather than served from a route: no network, no cache
     * headers to get wrong, and the demo has to work offline (PRD §2).
     * The BOM makes Excel read the Dari sample rows as UTF-8 instead of mojibake.
     */
    const csv = `﻿${[template.header, ...template.sample].join('\r\n')}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'gulbahar-products-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const parsed = await parseImport(formData);
      if (!parsed.ok) {
        toast.error(t(`errors.${parsed.error}` as never));
        setResult(null);
        return;
      }
      setResult(parsed);
    });
  }

  function confirm() {
    if (!result?.ok) return;
    const applicable = result.rows.filter((row) => row.status !== 'error');

    startTransition(async () => {
      const outcome = await confirmImport(applicable);
      if (!outcome.ok) {
        toast.error(t(`errors.${outcome.error}` as never));
        return;
      }
      toast.success(
        t('done', {
          created: formatNumber(outcome.created, locale),
          updated: formatNumber(outcome.updated, locale),
        }),
      );
      router.refresh();
      localeRouter.push('/dashboard/products?status=draft');
    });
  }

  return (
    <div className="space-y-4">
      {/* Step 1 — template + file */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <div>
          <h2 className="text-sm font-bold">{t('step1')}</h2>
          <p className="text-muted-foreground text-xs">{t('step1Hint')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download />
            {t('downloadTemplate')}
          </Button>

          <Button asChild size="sm" variant="secondary">
            <label className="cursor-pointer">
              <FileUp />
              {pending && !result ? t('reading') : t('chooseFile')}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={onFile}
                disabled={pending}
              />
            </label>
          </Button>
        </div>

        {fileName && (
          <p className="text-muted-foreground text-xs" dir="ltr">
            {fileName}
          </p>
        )}

        <ul className="text-muted-foreground space-y-1 text-xs">
          <li>{t('ruleRequired')}</li>
          <li>{t('ruleDigits')}</li>
          <li>{t('ruleSpecs')}</li>
          {/* Stated up front, because it is the surprising part. */}
          <li className="text-foreground font-medium">{t('ruleDraft')}</li>
        </ul>
      </section>

      {/* Step 2 — review */}
      {result?.ok && (
        <section className="rounded-card border-border bg-card space-y-3 border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">{t('step2')}</h2>
              <p className="text-muted-foreground text-xs">
                {t('rowCount', { count: formatNumber(result.rows.length, locale) })}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="success">
                <PlusCircle className="h-3 w-3" aria-hidden />
                {t('willCreate', { count: formatNumber(result.summary.create, locale) })}
              </Badge>
              <Badge variant="secondary">
                <RefreshCw className="h-3 w-3" aria-hidden />
                {t('willUpdate', { count: formatNumber(result.summary.update, locale) })}
              </Badge>
              {result.summary.error > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {t('hasErrors', { count: formatNumber(result.summary.error, locale) })}
                </Badge>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t('colLine')}</TableHead>
                  <TableHead>{t('colTitle')}</TableHead>
                  <TableHead>{t('colPrice')}</TableHead>
                  <TableHead>{t('colStock')}</TableHead>
                  <TableHead>{t('colOutcome')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <ReviewRow key={row.line} row={row} locale={locale} />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={confirm}
              disabled={pending || result.summary.create + result.summary.update === 0}
            >
              {pending ? t('importing') : t('confirmImport')}
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)} disabled={pending}>
              {t('startOver')}
            </Button>
            {result.summary.error > 0 && (
              // Bad rows are skipped, not fatal: a merchant should not have to
              // repair a 60-row file before importing the 58 good ones.
              <span className="text-muted-foreground text-xs">{t('errorRowsSkipped')}</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ReviewRow({ row, locale }: { row: ImportRow; locale: string }) {
  const t = useTranslations('shopProducts.importWizard');

  return (
    <TableRow className={row.status === 'error' ? 'bg-danger-50/60' : undefined}>
      <TableCell className="text-muted-foreground text-xs">
        {formatNumber(row.line, locale)}
      </TableCell>
      <TableCell className="max-w-56">
        <span className="clamp-1 text-sm" dir="auto">
          {row.titleFa || '—'}
        </span>
        {row.slug && (
          <span className="text-muted-foreground block text-xs" dir="ltr">
            {row.slug}
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm">
        {row.price > 0 ? formatCurrency(row.price, locale) : '—'}
      </TableCell>
      <TableCell className="text-sm">{formatNumber(row.stock, locale)}</TableCell>
      <TableCell>
        {row.status === 'create' && <Badge variant="success">{t('outcomeCreate')}</Badge>}
        {row.status === 'update' && <Badge variant="secondary">{t('outcomeUpdate')}</Badge>}
        {row.status === 'error' && (
          <span className="flex flex-col gap-0.5">
            <Badge variant="destructive">{t('outcomeError')}</Badge>
            {/* The reason, not just "invalid" — the acceptance bar for this screen. */}
            <span className="text-danger-700 text-xs">
              {t(`reasons.${row.reason ?? 'missing_required'}` as never)}
            </span>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
