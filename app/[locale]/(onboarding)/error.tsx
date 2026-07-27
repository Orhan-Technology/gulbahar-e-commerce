'use client';

import * as React from 'react';

import { ErrorState } from '@/components/custom/error-state';

/**
 * Error boundary for the (onboarding) route group (PRD §10.5).
 *
 * Registration is the first thing a tenant ever does here, so the copy makes clear nothing was lost and they can try again.
 *
 * Must be a client component — that is Next's contract for error.tsx, which is also
 * why the strings come from useTranslations rather than getTranslations.
 */
export default function OnboardingGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Logged rather than rendered: an audience reading a stack trace mid-demo is
    // worse than a friendly message.
    console.error('[(onboarding)] route error', error);
  }, [error]);

  return <ErrorState reset={reset} digest={error.digest} namespace="onboarding" backHref="/" />;
}
