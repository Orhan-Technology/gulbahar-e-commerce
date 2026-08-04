'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Polls the server for new work by re-running the page's server components
 * (PRD §6.3 acceptance: an order placed on the storefront lands in the queue in
 * real time).
 *
 * A poll rather than a socket: the demo runs on one machine with no external
 * services (PRD §12.1), and `router.refresh()` re-renders the RSC payload without
 * touching client state — the scroll position, any open dialog, and a
 * half-typed rejection reason all survive.
 *
 * Pauses while the tab is hidden. A presenter leaves the dashboard open on a
 * second screen for the whole walkthrough, and there is no reason to keep the
 * database busy for a tab nobody is looking at.
 *
 * …AND PAUSES WHILE SOMETHING ON SCREEN IS MID-MOMENT. Anything rendering
 * `data-hold-refresh` is telling the poll to wait: the handover celebration
 * (components/dashboard/orders/collect-form.tsx) lives in a subtree the refresh
 * would unmount — the order is fulfilled now, so its controls are gone — and a
 * ten-second timer landing half a second after the code matched would wipe the
 * one beat of feedback the whole interaction is for. A DOM flag rather than
 * context or a store because the two components are nowhere near each other in
 * the tree and this is the entire contract between them.
 */
export function LiveRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.querySelector('[data-hold-refresh]')) return;
      router.refresh();
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Catch up immediately on return rather than waiting a full interval.
        tick();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
