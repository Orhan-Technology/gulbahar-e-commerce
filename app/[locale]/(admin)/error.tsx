'use client';

import * as React from 'react';

import { ErrorState } from '@/components/custom/error-state';

/**
 * Error boundary for the (admin) route group (PRD §10.5).
 *
 * Mall management, so the copy is plainer and points at the overview.
 *
 * Must be a client component — that is Next's contract for error.tsx, which is also
 * why the strings come from useTranslations rather than getTranslations.
 */
export default function AdminGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Logged rather than rendered: an audience reading a stack trace mid-demo is
    // worse than a friendly message.
    console.error('[(admin)] route error', error);
  }, [error]);

  return <ErrorState reset={reset} digest={error.digest} namespace="admin" backHref="/admin" />;
}
