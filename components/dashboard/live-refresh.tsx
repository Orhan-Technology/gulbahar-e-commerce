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
 */
export function LiveRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Catch up immediately on return rather than waiting a full interval.
        router.refresh();
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
