'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Link } from '@/lib/i18n/navigation';

/**
 * Shared error UI for every route group's error.tsx (PRD §10.5).
 *
 * One component rather than four near-copies, because the differences between the
 * surfaces are only the wording and where "back" goes — and those are props.
 *
 * The retry button calls Next's `reset`, which re-renders the segment rather than
 * reloading the page: a transient database hiccup mid-demo recovers without losing
 * the presenter's place.
 *
 * The technical message is NOT shown. During a demo an audience reading a stack
 * trace is worse than no information at all; the digest is logged to the console
 * for whoever is debugging.
 */
export function ErrorState({
  reset,
  digest,
  namespace,
  backHref,
}: {
  reset: () => void;
  digest?: string;
  /** Which set of strings to use — each surface says something different. */
  namespace: 'shop' | 'dashboard' | 'admin' | 'onboarding';
  backHref: string;
}) {
  const t = useTranslations('errorStates');

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <span
          className="rounded-pill bg-danger-bg text-danger mx-auto flex h-14 w-14 items-center justify-center"
          aria-hidden
        >
          <AlertTriangle className="h-7 w-7" />
        </span>

        <div className="space-y-1.5">
          <h1 className="text-base font-bold">{t(`${namespace}.title` as never)}</h1>
          <p className="text-muted-foreground text-sm">{t(`${namespace}.body` as never)}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw />
            {t('retry')}
          </Button>
          <Button asChild variant="outline">
            <Link href={backHref}>{t(`${namespace}.back` as never)}</Link>
          </Button>
        </div>

        {/* Present for a developer reading the console, absent from the screen. */}
        {digest && <p className="sr-only">{digest}</p>}
      </div>
    </div>
  );
}
