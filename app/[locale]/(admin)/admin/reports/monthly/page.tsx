import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { PrintButton } from '@/components/admin/print-button';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { auditActivityBetween } from '@/lib/db/queries/audit';
import { platformTotalsBetween, topShopsBetween } from '@/lib/db/queries/admin-reports';
import { revenueBySlot, revenueMonthToDate } from '@/lib/db/queries/admin-revenue';
import { floorOccupancy } from '@/lib/db/queries/mall';
import { siteSettings } from '@/lib/db/queries/settings';
import { formatCurrency, formatDate, formatMonthYear, formatNumber, formatPercent } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import {
  localeMonthBounds,
  monthKey,
  parseMonthKey,
  startOfNextLocaleMonth,
  startOfPreviousLocaleMonth,
} from '@/lib/locale-month';
import { cn } from '@/lib/utils';

type Query = { month?: string };

/**
 * «گزارش ماه برای مالکان» — the one page a mall director renews for (Prompt C12).
 *
 * WHAT IT IS FOR. Every other screen in this console is for RUNNING the mall.
 * This one is for REPORTING UPWARD: the director's own owners want a page, once
 * a month, that says how full the building is, what it traded, what the
 * advertising earned, who the top tenants were, and what management decided.
 * Until now producing that meant taking five screenshots from four screens
 * whose windows did not agree with each other.
 *
 * ONE MONTH, THE READER'S MONTH. Every figure on this page is cut on the same
 * solar month boundary (lib/locale-month.ts) — which is the whole point of an
 * artifact somebody prints: two sections measuring different fortnights is
 * exactly the thing that gets noticed in a boardroom. The month is in the URL,
 * so last month's report is a link and not a memory.
 *
 * IT REUSES THE EXISTING PLUMBING and adds no numbers of its own: occupancy
 * from `floorOccupancy`, trade from `platformTotalsBetween` (the per-column
 * predicates of the reports page), placement from `revenueMonthToDate`, and
 * decisions from the audit log. If a figure here disagrees with a section
 * screen, the section screen is what changed.
 *
 * PRINTABLE. `print:` utilities strip the chrome and force the panels onto
 * white — a director forwards a PDF, and a blue sidebar in the margin of it is
 * the difference between a document and a screenshot.
 */
export default async function AdminMonthlyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  await requireAdmin(locale);
  const t = await getTranslations('adminMonthlyReport');

  /*
   * The clock is read ONCE here, on the server, and the bounds travel into
   * every query below — a component may not read it during render (React 19
   * purity, CLAUDE.md), and a report whose sections each called `new Date()`
   * could straddle midnight.
   */
  const now = new Date();
  const monthStart = parseMonthKey(query.month, locale, now);
  const monthEnd = startOfNextLocaleMonth(monthStart, locale);
  const previousStart = startOfPreviousLocaleMonth(monthStart, locale);

  /*
   * For the CURRENT month the ad-revenue block compares like with like —
   * month-to-date against the same stretch of the previous month — which is
   * what `localeMonthBounds` produces. For a PAST month the month is over, so
   * the comparison is the whole of it against the whole of the one before.
   */
  const isCurrentMonth = monthKey(monthStart) === monthKey(localeMonthBounds(locale, now).start);
  const bounds = isCurrentMonth
    ? localeMonthBounds(locale, now)
    : {
        start: monthStart,
        end: monthEnd,
        previousStart,
        previousEnd: monthStart,
        dayOfMonth: Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000),
        daysInMonth: Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000),
        partial: false,
      };

  const [settings, floors, trade, placement, slots, leaders, decisions] = await Promise.all([
    siteSettings(),
    // Occupancy is a statement about the building TODAY, not about the month —
    // a floor plan has no history in this schema and pretending otherwise would
    // be the one invented number on a page whose value is that it has none.
    floorOccupancy(30),
    platformTotalsBetween({
      start: monthStart,
      end: monthEnd,
      previousStart,
      previousEnd: bounds.previousEnd,
    }),
    revenueMonthToDate(bounds),
    revenueBySlot({ start: monthStart, end: monthEnd }),
    topShopsBetween(monthStart, monthEnd, 5),
    auditActivityBetween(monthStart, monthEnd),
  ]);

  const units = floors.reduce(
    (sum, floor) => ({
      occupied: sum.occupied + floor.shops.length,
      vacant: sum.vacant + floor.vacantUnits.length,
    }),
    { occupied: 0, vacant: 0 },
  );
  const knownUnits = units.occupied + units.vacant;
  const occupancy = knownUnits > 0 ? units.occupied / knownUnits : 0;

  const slotCapacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const slotsSold = slots.reduce((sum, slot) => sum + slot.occupied, 0);

  const monthLabel = formatMonthYear(monthStart, locale);
  const href = (start: Date) => `/admin/reports/monthly?month=${monthKey(start)}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 print:max-w-none print:p-0">
      {/* The stepper and the print button are chrome, not content. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/reports" className="text-primary text-xs font-medium">
          {t('backToReports')}
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href={href(previousStart)}
            aria-label={t('previousMonth')}
            className="rounded-control border-border bg-card hover:border-primary border p-1.5"
          >
            {/* Mirrored in RTL: the arrow points the way the page reads. */}
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
          <span className="min-w-32 text-center text-sm font-semibold">{monthLabel}</span>
          <Link
            href={href(monthEnd)}
            aria-label={t('nextMonth')}
            className="rounded-control border-border bg-card hover:border-primary border p-1.5"
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>

          <PrintButton label={t('print')} />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <article
        className="rounded-card border-border bg-card space-y-6 border p-6 print:rounded-none print:border-0 print:p-0"
        data-monthly-report
      >
        <header className="border-border border-b pb-4">
          {/* `mallName` is a LocalizedText, not a string — rendering the object
              is an "Objects are not valid as a React child" 500, not a type error. */}
          <p className="text-muted-foreground text-xs">
            {pickLocale(settings.mallName, locale)}
          </p>
          <h1 className="mt-1 text-2xl font-bold">{t('title', { month: monthLabel })}</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('coverage', {
              from: formatDate(monthStart, locale, 'medium'),
              to: formatDate(new Date(monthEnd.getTime() - 86_400_000), locale, 'medium'),
            })}
            {bounds.partial && ` · ${t('partialMonth', { day: formatNumber(bounds.dayOfMonth, locale) })}`}
          </p>
        </header>

        {/* 1 — the building ------------------------------------------------ */}
        <Section title={t('occupancyHeading')}>
          <Figure
            value={formatPercent(occupancy, locale)}
            label={t('occupancyLabel', {
              online: formatNumber(units.occupied, locale),
              units: formatNumber(knownUnits, locale),
            })}
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t('occupancyNote', {
              vacant: formatNumber(units.vacant, locale),
              floors: formatNumber(floors.length, locale),
            })}
          </p>
        </Section>

        {/* 2 — what the tenants traded ------------------------------------ */}
        <Section title={t('tradeHeading')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure
              value={formatCurrency(trade.gmv, locale)}
              label={t('gmvLabel')}
              delta={trade.gmvDelta}
              deltaLabel={
                trade.gmvDelta === null
                  ? t('noPreviousMonth')
                  : t('vsPreviousMonth', {
                      amount: formatCurrency(trade.previousGmv, locale),
                    })
              }
              locale={locale}
            />
            <Figure
              value={formatNumber(trade.orderCount, locale)}
              label={t('ordersLabel')}
              delta={trade.orderDelta}
              deltaLabel={
                trade.orderDelta === null
                  ? t('noPreviousMonth')
                  : t('vsPreviousMonthCount', {
                      count: formatNumber(trade.previousOrderCount, locale),
                    })
              }
              locale={locale}
            />
            <Figure value={formatNumber(trade.buyers, locale)} label={t('buyersLabel')} />
          </div>
        </Section>

        {/* 3 — what the mall itself earned -------------------------------- */}
        <Section title={t('placementHeading')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure
              value={formatCurrency(placement.current, locale)}
              label={t('adRevenueLabel')}
              delta={placement.delta}
              deltaLabel={
                placement.delta === null
                  ? t('noPreviousMonth')
                  : t('vsPreviousMonth', {
                      amount: formatCurrency(placement.previous, locale),
                    })
              }
              locale={locale}
            />
            <Figure
              value={formatCurrency(placement.bookedThisMonth, locale)}
              label={t('bookedLabel')}
            />
            <Figure
              value={t('slotsSold', {
                sold: formatNumber(slotsSold, locale),
                total: formatNumber(slotCapacity, locale),
              })}
              label={t('slotsLabel')}
            />
          </div>
          {/* The distinction that keeps the two money figures honest — billed
              money versus placement on the walls (PRD §8.3). */}
          <p className="text-muted-foreground text-xs leading-relaxed">{t('placementNote')}</p>
        </Section>

        {/* 4 — the top tenants -------------------------------------------- */}
        <Section title={t('topShopsHeading')}>
          {leaders.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('noTrade')}</p>
          ) : (
            <ol className="divide-border divide-y">
              {leaders.map((shop, index) => (
                <li key={shop.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="text-muted-foreground w-4 shrink-0 text-center text-xs font-bold tabular-nums">
                    {formatNumber(index + 1, locale)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {pickLocale(shop.name, locale)}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {t('shopOrders', {
                      n: shop.orderCount,
                      count: formatNumber(shop.orderCount, locale),
                    })}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">
                    {formatCurrency(shop.revenue, locale)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* 5 — what management did ---------------------------------------- */}
        <Section title={t('decisionsHeading')}>
          <p className="text-sm leading-relaxed" data-decision-line>
            {decisions.total === 0
              ? t('noDecisions')
              : t('decisionLine', {
                  total: formatNumber(decisions.total, locale),
                  actors: formatNumber(decisions.actors, locale),
                  shops: formatNumber(decisions.shopsApproved, locale),
                  verifications: formatNumber(decisions.verifications, locale),
                  campaigns: formatNumber(decisions.campaigns, locale),
                })}
          </p>
        </Section>

        <footer className="border-border text-muted-foreground border-t pt-4 text-2xs">
          {t('footer', { generated: formatDate(now, locale, 'medium') })}
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 print:break-inside-avoid">
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * One figure and its caption.
 *
 * NOT `StatCard`: that component counts up on mount, which is a presentation
 * flourish for a live console and is exactly wrong on a page whose purpose is
 * to be printed — a PDF generated mid-animation shows a number on its way
 * somewhere.
 */
function Figure({
  value,
  label,
  delta,
  deltaLabel,
  locale,
}: {
  value: string;
  label: string;
  delta?: number | null;
  deltaLabel?: string;
  locale?: string;
}) {
  return (
    <div>
      <p className="text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
      {deltaLabel && (
        <p className="mt-0.5 text-xs">
          {delta !== null && delta !== undefined && locale && (
            <span
              className={cn(
                'font-semibold',
                delta >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {delta >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(delta), locale)}{' '}
            </span>
          )}
          <span className="text-muted-foreground">{deltaLabel}</span>
        </p>
      )}
    </div>
  );
}
