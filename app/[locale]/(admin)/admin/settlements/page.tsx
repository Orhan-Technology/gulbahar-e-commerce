import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Banknote } from 'lucide-react';

import { ConsolePageHeader } from '@/components/console/page-header';
import { UnavailableCard } from '@/components/custom/unavailable-card';
import { requireAdmin } from '@/lib/auth/guards';

/**
 * Settlements — DESIGNED, DISABLED (Prompt C9, and A3's honesty rule).
 *
 * "How do shops get paid" is the question every client asks about a
 * marketplace, and this build has no answer: there is no payment gateway, no
 * ledger, no payout run, and inventing one would be the single most damaging
 * thing this demo could pretend to do. Money that appears on a screen gets
 * believed.
 *
 * So the screen shows the SHAPE and nothing else. The column headers are the
 * ones a real settlement run would have — per shop, per period: fulfilled
 * revenue, commission, net payable — and every cell is empty, on purpose, above
 * a sentence saying why. A client asking the question in the room gets a
 * considered answer instead of silence, and nobody leaves believing a payout
 * happened.
 *
 * NO INVENTED NUMBERS PRESENTED AS REAL. The revenue figures needed to fill
 * this table DO exist in the database — which is exactly why the temptation had
 * to be refused explicitly: a table of real revenue under a heading that says
 * "net payable" is a statement about money owed, and this build cannot make it.
 *
 * THE ONE «نمونه» ROW is the deliberate exception, and it is the opposite of
 * that mistake. An empty table shows the column NAMES; it does not show what a
 * settlement LINE looks like, and a stakeholder cannot react to a shape they
 * have not seen — "we settle by category, not by shop" is the kind of thing
 * that only gets said once there is a row on screen to disagree with.
 *
 * So there is exactly one row, it is dimmed, its first cell says «نمونه», its
 * shop is a placeholder name, and — this is the part that matters — ITS MONEY
 * CELLS CONTAIN NO DIGITS. They are masked (••٬•••), which shows a reader
 * exactly where a figure will sit and how the three columns relate, while being
 * literally unreadable as an amount. A dimmed row of real-looking afghanis
 * would be the invented-numbers mistake wearing a «نمونه» label, and a label is
 * not a defence: people screenshot tables, and the label does not travel with
 * the number. scripts/check-admin.ts asserts that no currency figure appears on
 * this page at all, which is the guarantee this design keeps rather than argues
 * its way around.
 */
export default async function AdminSettlementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminSettlements');

  const columns = ['shop', 'period', 'revenue', 'commission', 'net', 'status'] as const;

  return (
    <div className="space-y-5 p-6">
      <ConsolePageHeader title={t('title')} description={t('subtitle')} />

      <UnavailableCard
        icon={<Banknote className="h-5 w-5" aria-hidden />}
        title={t('unavailableTitle')}
        body={t('unavailableBody')}
        pillLabel={t('pill')}
      />

      {/*
        The structure, with no data in it. Rendered as a real table rather than
        a screenshot or a description, because the point is that the shape is
        already decided — a client can tell us here that they settle weekly, or
        that commission varies by category, and that conversation is worth more
        than the numbers would have been.
      */}
      <section className="rounded-card border-border overflow-hidden border border-dashed bg-neutral-50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-neutral-500">
                {columns.map((column) => (
                  <th key={column} className="px-4 py-2.5 text-start text-xs font-semibold">
                    {t(`columns.${column}` as never)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/*
                The sample line. Values are round numbers chosen to make the
                arithmetic visible at a glance (commission is a tenth of
                revenue), which is the point being illustrated — not the amounts.
              */}
              <tr className="border-border border-b opacity-50" data-settlement-sample>
                <td className="px-4 py-3 text-sm">
                  <span className="rounded-pill bg-neutral-200 px-2 py-0.5 text-2xs font-bold text-neutral-600">
                    {t('sampleTag')}
                  </span>
                  <span className="text-muted-foreground ms-2">{t('sampleShop')}</span>
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">{t('samplePeriod')}</td>
                {/*
                  Masked, not fake. The dots occupy the width a grouped afghani
                  figure would and carry no digits — see the note at the top of
                  this file for why that distinction is load-bearing.
                */}
                <td className="text-muted-foreground px-4 py-3 text-sm tracking-widest">••••••</td>
                <td className="text-muted-foreground px-4 py-3 text-sm tracking-widest">•••••</td>
                <td className="text-muted-foreground px-4 py-3 text-sm font-bold tracking-widest">
                  ••••••
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-pill bg-neutral-200 px-2 py-0.5 text-2xs font-semibold text-neutral-600">
                    {t('sampleStatus')}
                  </span>
                </td>
              </tr>
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-neutral-500">{t('emptyTitle')}</p>
                  <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs leading-relaxed">
                    {t('emptyBody')}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-card border-border bg-card space-y-2 border p-4">
        <h2 className="text-sm font-bold">{t('todayTitle')}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">{t('todayBody')}</p>
      </section>
    </div>
  );
}
