'use client';

import * as React from 'react';

import { ErrorState } from '@/components/custom/error-state';

/**
 * Error boundary for the (shop) route group (PRD §10.5).
 *
 * A customer who hits this is mid-purchase, so the copy apologises and offers the way back to the storefront rather than explaining anything technical.
 *
 * Must be a client component — that is Next's contract for error.tsx, which is also
 * why the strings come from useTranslations rather than getTranslations.
 */
export default function ShopGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Logged rather than rendered: an audience reading a stack trace mid-demo is
    // worse than a friendly message.
    console.error('[(shop)] route error', error);
  }, [error]);

  return <ErrorState reset={reset} digest={error.digest} namespace="shop" backHref="/" />;
}
