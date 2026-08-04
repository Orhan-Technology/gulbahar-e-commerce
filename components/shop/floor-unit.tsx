'use client';

import * as React from 'react';

import { Link, useRouter } from '@/lib/i18n/navigation';

/**
 * A unit on the floor plan (Prompt C11).
 *
 * IT IS A LINK TO THE SHOP, and on a wide screen it is not.
 *
 * Below the map there was ~60% of empty viewport on a desktop, and every tap on
 * the plan left the page — so the map could only ever be consulted once. A
 * shopper comparing three shops on the second floor had to go there, come back,
 * find the plan again, and lose the floor they were on each time. That is a
 * diagram. From `lg`, where there is room beside the plan for a panel, the click
 * SELECTS the unit instead: the panel fills, the map keeps its highlight, and
 * the next unit is one click away rather than three.
 *
 * MOBILE KEEPS NAVIGATING. There is no width for a panel beside a 390px plan,
 * and putting one underneath would push the map off the screen the moment
 * somebody used it — the opposite of the fix. On a phone the plan is a way in
 * and the list below it names every shop in full anyway.
 *
 * THE HREF IS THE SHOP AT EVERY WIDTH, and the desktop behaviour is an
 * interception. That ordering matters: middle-click, ⌘-click and "open in new
 * tab" all reach the shop, a crawler follows the shop, and with JavaScript not
 * yet loaded the plan still works. The panel is an enhancement layered on a link
 * that already went somewhere useful.
 *
 * `matchMedia` is read IN THE HANDLER. Reading it during render would branch the
 * markup on something the server cannot know and produce a hydration mismatch on
 * every unit of every floor.
 */
export function FloorUnitLink({
  href,
  panelHref,
  children,
  className,
  title,
  ariaCurrent,
  mapUnit,
  mapState,
}: {
  /** The shop's own page — where a tap goes on a phone and where the href points. */
  href: string;
  /** The same map with `?unit=` set. Omit to keep plain navigation everywhere. */
  panelHref?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  ariaCurrent?: 'location';
  /* `data-map-*` are the auditors' hooks on the plan — named as ordinary props
     rather than spread, because a `data-` key does not survive next-intl's Link
     prop type and the spread that carried them here typechecked only by
     accident. */
  mapUnit: number;
  mapState: string;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      className={className}
      title={title}
      aria-current={ariaCurrent}
      data-map-unit={mapUnit}
      data-map-state={mapState}
      onClick={(event) => {
        if (!panelHref) return;
        // Let the browser have the gestures that mean "somewhere else, please".
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        if (!window.matchMedia('(min-width: 1024px)').matches) return;
        event.preventDefault();
        /*
         * `replace`, not `push`: selecting six units in a row would otherwise
         * bury the page the reader arrived from under six history entries, and
         * back would walk them through a plan they are still looking at.
         * `scroll: false` because the map must not jump under the cursor that
         * just clicked it.
         */
        router.replace(panelHref, { scroll: false });
      }}
    >
      {children}
    </Link>
  );
}
