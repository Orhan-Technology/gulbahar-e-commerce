'use client';

import * as React from 'react';

import { ErrorState } from '@/components/custom/error-state';

/**
 * Error boundary for the (dashboard) route group (PRD §10.5).
 *
 * A shopkeeper here is trying to run their business, so the copy says their data is safe — the most likely worry when a screen breaks.
 *
 * Must be a client component — that is Next's contract for error.tsx, which is also
 * why the strings come from useTranslations rather than getTranslations.
 */
export default function DashboardGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Logged rather than rendered: an audience reading a stack trace mid-demo is
    // worse than a friendly message.
    console.error('[(dashboard)] route error', error);
  }, [error]);

  return (
    <ErrorState reset={reset} digest={error.digest} namespace="dashboard" backHref="/dashboard" />
  );
}
