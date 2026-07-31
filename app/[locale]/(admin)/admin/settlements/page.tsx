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
 * NO INVENTED NUMBERS. Not a sample row, not a greyed-out example, not
 * lorem-ipsum afghanis. The revenue figures needed to fill this table DO exist
 * in the database — which is exactly why the temptation had to be refused
 * explicitly: a table of real revenue under a heading that says "net payable"
 * is a statement about money owed, and this build cannot make it.
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
