'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';

import {
  ManualCampaignDialog,
  type ManualProduct,
  type ManualShop,
  type ManualSlot,
} from '@/components/admin/manual-campaign-dialog';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * SELLING THE EMPTY WEEK — the calendar's vacant cells, made clickable
 * (Prompt C12).
 *
 * WHAT WAS WRONG. `/admin/promotions/calendar` draws every slot-day of the
 * month and colours the unsold ones. Those green squares are the single most
 * commercially interesting thing on the console — they are literally the
 * question a shopkeeper phones the management office to ask — and clicking one
 * filtered a list below the grid. The mall could SEE its unsold inventory and
 * could not sell it from the screen that showed it.
 *
 * WHY A PROVIDER AND NOT A DIALOG PER CELL. A month grid is six slots by
 * thirty-one days: rendering a dialog inside every vacant cell would mount two
 * hundred copies of a form carrying the full shop and product lists. One dialog
 * lives here, at the top of the table, and the cells only say which slot-day
 * was clicked.
 *
 * The grid itself STAYS A SERVER COMPONENT — it is passed through as
 * `children`, so the day arithmetic, the localised numerals and the slot names
 * are all still resolved on the server. Only the cells and this shell are
 * client code.
 *
 * ONE BOOKING PATH. The dialog is the same `ManualCampaignDialog` the page
 * header already renders, in controlled mode, writing through the same
 * `createCampaignForShop` action — which validates with Zod, refuses an
 * oversold slot, notifies the shop and writes the audit line. A second booking
 * route would be a second place for those five rules to drift.
 */

/**
 * Exactly what the dialog needs and nothing more.
 *
 * The slot's NAME and PRICE are deliberately not carried: the dialog already
 * has the full slot list and looks both up by id, and a second copy travelling
 * beside the id is a second thing to keep in step.
 */
type Prefill = { slotId: string; startsAt: string };

type BookingContext = { book: (prefill: Prefill) => void };

const PlacementBookingContext = React.createContext<BookingContext | null>(null);

export function PlacementBookingProvider({
  slots,
  shops,
  products,
  children,
}: {
  slots: ManualSlot[];
  shops: ManualShop[];
  products: ManualProduct[];
  children: React.ReactNode;
}) {
  const [prefill, setPrefill] = React.useState<Prefill | null>(null);

  const value = React.useMemo<BookingContext>(() => ({ book: setPrefill }), []);

  return (
    <PlacementBookingContext.Provider value={value}>
      {children}

      <ManualCampaignDialog
        slots={slots}
        shops={shops}
        products={products}
        open={prefill !== null}
        // Closing clears the prefill, which is what lets the SAME cell be
        // clicked twice — the dialog compares prefill identity to decide
        // whether to re-apply it.
        onOpenChange={(open) => {
          if (!open) setPrefill(null);
        }}
        prefill={prefill}
      />
    </PlacementBookingContext.Provider>
  );
}

/**
 * One unsold slot-day, as a button.
 *
 * `title` carries the price, because the first question about a vacant square
 * is what it costs and the second is who is free to take it. Falls back to a
 * plain, non-interactive cell when no provider is above it, so the component
 * cannot render a control that does nothing.
 */
export function VacantSlotCell({
  slotId,
  pricePerWeek,
  day,
  label,
  className,
}: {
  slotId: string;
  pricePerWeek: number;
  /** YYYY-MM-DD — the day this cell stands for. */
  day: string;
  /** Screen-reader text, built on the server where the numerals are localised. */
  label: string;
  className?: string;
}) {
  const context = React.useContext(PlacementBookingContext);
  const t = useTranslations('adminPromotions.slotCalendar');
  const locale = useLocale();

  const title = `${label} · ${t('sellThisDay', { price: formatCurrency(pricePerWeek, locale) })}`;

  if (!context) {
    return <span className={className} title={label} aria-hidden />;
  }

  return (
    <button
      type="button"
      data-slot-day="vacant"
      data-sellable
      title={title}
      onClick={() =>
        context.book({
          slotId,
          // Midnight UTC on the clicked day. The action derives the end from
          // the week count, so the window is exactly the run being sold.
          startsAt: `${day}T00:00:00.000Z`,
        })
      }
      className={cn(
        /*
         * It has to LOOK sellable. A vacant cell already had a dashed border;
         * what it lacked was any sign that pressing it does something — so the
         * hover state fills it with the primary tint and shows a plus, which is
         * the same "add" affordance the header button uses.
         */
        'group flex h-7 w-full items-center justify-center rounded-[3px] border border-dashed border-neutral-300 bg-white transition-colors duration-150',
        'hover:border-primary hover:bg-primary-50 focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      <Plus
        className="text-primary h-3 w-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        aria-hidden
      />
      <span className="sr-only">{title}</span>
    </button>
  );
}
