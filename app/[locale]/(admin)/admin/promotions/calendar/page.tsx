import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';

import { ManualCampaignDialog } from '@/components/admin/manual-campaign-dialog';
import {
  PlacementBookingProvider,
  VacantSlotCell,
} from '@/components/admin/placement-booking';
import { ConsolePageHeader } from '@/components/console/page-header';
import { EmptyState } from '@/components/custom/empty-state';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminProducts, adminShopDirectory } from '@/lib/db/queries/admin';
import { monthBookings, revenueBySlot, slotMonth } from '@/lib/db/queries/admin-revenue';
import { formatCurrency, formatDate, formatMonthYear, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import {
  localeDayOfMonth,
  monthKey,
  parseMonthKey,
  startOfNextLocaleMonth,
  startOfPreviousLocaleMonth,
} from '@/lib/locale-month';
import { slotAcceptsProduct, slotRequiresProduct } from '@/lib/promotions';
import type { PromotionSlotKey } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

type Query = { month?: string; slot?: string };

/**
 * The promotion slot calendar (Prompt C9).
 *
 * SLOT REVENUE IS THE CLIENT'S INCOME, and until now the console showed them
 * what it earned but never what was left to sell. This page inverts that: the
 * empty cells are the subject. Every white square is a slot-day nobody has been
 * asked to buy, on a surface the mall already owns.
 *
 * ROWS ARE SLOTS, COLUMNS ARE DAYS. Days rather than weeks because campaigns
 * are sold by the week but do not start on Mondays — a booking running the 12th
 * to the 26th leaves eleven sellable days at the front of the month, and a
 * weekly grid paints over exactly that gap.
 *
 * The grid shows SOLD inventory only (approved and active); the list below it
 * includes REQUESTED ones, because a pending request is the thing an admin
 * opened this page to decide. Colouring the grid with requests would oversell
 * the slot the moment two shops asked for the same week.
 */
export default async function AdminPromotionCalendarPage({
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
  const t = await getTranslations('adminPromotions.slotCalendar');

  /*
   * The month is THE READER'S month, not January-to-December.
   *
   * `fa-AF` renders every date in this product in the Afghan solar calendar, so
   * a grid built on Gregorian boundaries puts "Saratan" in the header above
   * columns numbered 1 to 31 of July — two different fortnights, described at
   * once. lib/locale-month.ts derives the bounds from the same engine that
   * renders the header.
   *
   * The clock is read HERE, once, on the server: a client component may not
   * call `new Date()` during render (React 19 purity, CLAUDE.md), and the page
   * has to stay shareable.
   */
  const monthStart = parseMonthKey(query.month, locale, new Date());
  const monthEnd = startOfNextLocaleMonth(monthStart, locale);

  const [rows, bookings, slots, shops, products] = await Promise.all([
    slotMonth(monthStart, monthEnd),
    monthBookings(monthStart, monthEnd),
    revenueBySlot({ start: monthStart, end: monthEnd }),
    adminShopDirectory({ locale, status: 'approved' }),
    adminProducts({ locale, status: 'published' }),
  ]);

  const days = rows[0]?.days ?? [];
  const vacantTotal = rows.reduce((sum, row) => sum + row.vacantDays, 0);
  const slotDays = rows.length * days.length;

  /*
   * WHAT THE EMPTY CELLS ARE WORTH — the one number a mall director would quote
   * (Prompt C12).
   *
   * The page already counted vacant slot-days and drew them; a count of squares
   * is a fact about a grid, not about a business. Priced, the same grid says
   * «there is ؋X of inventory on our own walls that nobody has been asked to
   * buy this month», which is what turns this screen from a report into a sales
   * target.
   *
   * A DAILY RATE DERIVED FROM THE WEEKLY ONE, and the figure is deliberately
   * presented as approximate: placement is sold by the week (PRD §8.3), so a
   * scatter of single vacant days is not literally sellable at a seventh of the
   * price each. Rounded to whole afghanis because every monetary value in this
   * product is an integer.
   */
  const vacantValue = rows.reduce(
    (sum, row) => sum + Math.round((row.pricePerWeek / 7) * row.vacantDays),
    0,
  );

  const filtered = query.slot
    ? bookings.filter((booking) => booking.slotId === query.slot)
    : bookings;

  /*
   * The booking dialog's option lists, built once and shared by the header
   * button and by every vacant cell in the grid (Prompt C12). One dialog, one
   * action, two ways in.
   */
  const manualSlots = slots.map((slot) => ({
    id: slot.id,
    name: pickLocale(slot.name, locale),
    pricePerWeek: slot.pricePerWeek,
    acceptsProduct: slotAcceptsProduct(slot.key as PromotionSlotKey),
    needsProduct: slotRequiresProduct(slot.key as PromotionSlotKey),
    available: Math.max(slot.capacity - slot.occupied, 0),
  }));
  const manualShops = shops.map((shop) => ({ id: shop.id, name: pickLocale(shop.name, locale) }));
  const manualProducts = products.map((product) => ({
    id: product.id,
    shopId: product.shopId,
    title: pickLocale(product.title, locale),
  }));

  const href = (next: { month?: string; slot?: string | null }) => {
    const month = next.month ?? monthKey(monthStart);
    const slot = next.slot === null ? undefined : (next.slot ?? query.slot);
    return `/admin/promotions/calendar?month=${month}${slot ? `&slot=${slot}` : ''}`;
  };

  return (
    <div className="space-y-5 p-6">
      <ConsolePageHeader
        title={t('title')}
        description={t('subtitleWithValue', {
          vacant: formatNumber(vacantTotal, locale),
          total: formatNumber(slotDays, locale),
          value: formatCurrency(vacantValue, locale),
        })}
        actions={
          <div className="flex items-center gap-2">
            {/* Directional icons mirror in RTL — the arrow pointing the way the
                page reads is always the one that goes forward. */}
            <Link
              href={href({ month: monthKey(startOfPreviousLocaleMonth(monthStart, locale)) })}
              aria-label={t('previousMonth')}
              className="rounded-control border-border bg-card hover:border-primary border p-1.5"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold">
              {formatMonthYear(monthStart, locale)}
            </span>
            <Link
              href={href({ month: monthKey(startOfNextLocaleMonth(monthStart, locale)) })}
              aria-label={t('nextMonth')}
              className="rounded-control border-border bg-card hover:border-primary border p-1.5"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>

            <ManualCampaignDialog
              slots={manualSlots}
              shops={manualShops}
              products={manualProducts}
            />
          </div>
        }
      />

      {/*
        THE GRID IS STILL A SERVER COMPONENT. It is passed through the provider
        as children, so day arithmetic, Persian numerals and slot names are all
        resolved on the server; only the vacant cells and the one dialog above
        them are client code.
      */}
      <PlacementBookingProvider slots={manualSlots} shops={manualShops} products={manualProducts}>
      <section className="rounded-card border-border bg-card overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" data-slot-calendar>
            <thead>
              <tr>
                <th className="bg-card sticky start-0 z-10 px-3 py-2 text-start font-semibold">
                  {t('slot')}
                </th>
                {days.map((day) => (
                  <th key={day.day} className="px-0.5 py-2 text-center font-normal text-neutral-500">
                    {formatNumber(localeDayOfMonth(new Date(`${day.day}T00:00:00.000Z`), locale), locale)}
                  </th>
                ))}
                <th className="px-3 py-2 text-end font-semibold">{t('vacantDays')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slotId} className="border-border border-t">
                  <td className="bg-card sticky start-0 z-10 px-3 py-2">
                    <Link
                      href={href({ slot: query.slot === row.slotId ? null : row.slotId })}
                      className={cn(
                        'font-medium',
                        query.slot === row.slotId ? 'text-primary' : 'hover:text-primary',
                      )}
                    >
                      {pickLocale(row.slotName, locale)}
                    </Link>
                    <span className="text-muted-foreground block text-2xs">
                      {t('perWeek', { price: formatCurrency(row.pricePerWeek, locale) })}
                    </span>
                  </td>

                  {row.days.map((day) => {
                    const full = day.booked >= row.capacity;
                    const empty = day.booked === 0;

                    /*
                      A VACANT CELL IS NOW A SALE, not a filter (Prompt C12).
                      Every other cell stays a link that narrows the list below,
                      because for a sold day "who has it" is the question. For an
                      unsold one the only useful question is "who could".
                    */
                    if (empty) {
                      return (
                        <td key={day.day} className="p-0.5">
                          <VacantSlotCell
                            slotId={row.slotId}
                            pricePerWeek={row.pricePerWeek}
                            day={day.day}
                            label={t('vacantCellLabel', {
                              slot: pickLocale(row.slotName, locale),
                              date: formatDate(
                                new Date(`${day.day}T00:00:00.000Z`),
                                locale,
                                'medium',
                              ),
                            })}
                          />
                        </td>
                      );
                    }

                    return (
                      <td key={day.day} className="p-0.5">
                        {/*
                          A LINK on a sold cell, filtering the list below to that
                          slot — "who is in this square" is answered underneath.
                        */}
                        <Link
                          href={href({ slot: row.slotId })}
                          data-slot-day={full ? 'full' : 'partial'}
                          title={`${day.day} · ${day.booked}/${row.capacity}`}
                          className={cn(
                            'block h-7 rounded-[3px] border transition-colors duration-150',
                            full
                              ? 'border-primary-700 bg-primary-600 hover:bg-primary-700'
                              : 'border-primary-300 bg-primary-200 hover:bg-primary-300',
                          )}
                        >
                          <span className="sr-only">{`${day.day} — ${day.booked}/${row.capacity}`}</span>
                        </Link>
                      </td>
                    );
                  })}

                  <td className="px-3 py-2 text-end tabular-nums">
                    <span className="block font-semibold">
                      {formatNumber(row.vacantDays, locale)}
                    </span>
                    {/* The row's own share of the unsold total. */}
                    <span className="text-muted-foreground text-2xs block">
                      {t('vacantValue', {
                        value: formatCurrency(
                          Math.round((row.pricePerWeek / 7) * row.vacantDays),
                          locale,
                        ),
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-border text-muted-foreground flex flex-wrap items-center gap-4 border-t px-3 py-2 text-2xs">
          <Legend className="bg-primary-600 border-primary-700" label={t('legendFull')} />
          <Legend className="bg-primary-200 border-primary-300" label={t('legendPartial')} />
          {/* The legend now says the vacant squares are for sale, because a
              colour key that only names a state hides the one interaction on
              this grid that earns money. */}
          <Legend
            className="border-dashed border-neutral-300 bg-white"
            label={t('legendVacantSellable')}
          />
        </div>
      </section>
      </PlacementBookingProvider>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">{t('bookingsTitle')}</h2>
          {query.slot && (
            <Link href={href({ slot: null })} className="text-primary text-xs font-medium">
              {t('clearSlotFilter')}
            </Link>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            illustration={<CalendarRange className="h-7 w-7" aria-hidden />}
            title={t('emptyTitle')}
            description={t('emptyBody')}
          />
        ) : (
          <ul className="rounded-card border-border bg-card divide-border divide-y overflow-hidden border">
            {filtered.map((booking) => (
              <li key={booking.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{pickLocale(booking.shopName, locale)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {pickLocale(booking.slotName, locale)} ·{' '}
                    {t('runs', {
                      from: formatDate(booking.startsAt, locale, 'medium'),
                      to: formatDate(booking.endsAt, locale, 'medium'),
                    })}
                  </span>
                </span>

                <span
                  className={cn(
                    'rounded-pill shrink-0 px-2 py-0.5 text-2xs font-semibold',
                    booking.status === 'requested'
                      ? 'bg-accent-warm/15 text-neutral-800'
                      : 'bg-success-50 text-success-700',
                  )}
                >
                  {t(`status.${booking.status}` as never)}
                </span>

                <span className="w-28 shrink-0 text-end font-semibold tabular-nums">
                  {formatCurrency(booking.pricePaid, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded-[3px] border', className)} aria-hidden />
      {label}
    </span>
  );
}
