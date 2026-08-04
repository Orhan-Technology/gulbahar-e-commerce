'use client';

import * as React from 'react';
import { MapPin } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * THE POCKET MALL.
 *
 * Every product on this storefront already said where it is — «طبقه اول · دکان
 * ۱۰۵» — and that line was inert text. It is the single fact that makes this
 * marketplace a MALL rather than another storefront, and it read as a footnote.
 * Tapping it now opens the floor it names, with this shop's unit lit up on the
 * plan, whether it is open right now, and the two things a person who has just
 * decided to buy might do next: go to the shop, or walk to the counter.
 *
 * A BOTTOM SHEET AT EVERY WIDTH, which is a deliberate departure from the usual
 * "drawer on mobile, dialog on desktop". The plan is a wide, short object — two
 * rows of units either side of a walkway — so it wants a wide, short container,
 * and that is what a bottom sheet is. A centred dialog would either crop the
 * plan or float it in a square box with air above and below. Same component and
 * same side as the filter sheet, so the gesture is one the reader already has.
 *
 * THE CONTENT IS SERVER-RENDERED and arrives as `children`. This component owns
 * the opening and closing and nothing else: the floor plan is a server
 * component with a database query behind it, and the alternative — fetching on
 * open — would put a spinner inside a sheet that is meant to feel instant.
 *
 * It is NOT the shop link in disguise. The identity card above still links to
 * the shop with the whole of its name and logo; this is the location, and the
 * sheet is what the location is FOR.
 */
export function MallSheet({
  label,
  title,
  children,
  className,
}: {
  /** The floor-and-unit line, already localised — this is the visible trigger. */
  label: string;
  /** Names the sheet for assistive tech; the shop's own name is the subject. */
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger
        className={cn(
          'text-muted-foreground hover:text-primary focus-visible:ring-ring rounded-control flex w-full items-center gap-1 text-start text-xs transition-colors duration-150 focus-visible:ring-2',
          className,
        )}
      >
        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate underline decoration-dotted underline-offset-2">{label}</span>
      </SheetTrigger>

      <SheetContent side="bottom" className="rounded-t-panel max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          {/* `dir="auto"`: the tenant's own name, in either script. */}
          <SheetTitle dir="auto">{title}</SheetTitle>
        </SheetHeader>
        {/* The plan is at its most legible around tablet width; on a wide
            monitor a full-bleed floor of seven-column cells stretches each unit
            into a letterbox. */}
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
