'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Inline SVG or icon. Rendered inside a tinted circle. */
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
  className?: string;
}

/**
 * Illustrated empty state with a next action (PRD §10.5).
 *
 * Never a bare "no results" line: every empty list tells the user what to do
 * next, which is where demos are won.
 *
 * Intentionally has NO .Skeleton, unlike the rest of components/custom/. An
 * empty state is a terminal result, not async content — while a list is loading
 * you render that list's skeleton, and only resolve to EmptyState once you know
 * the result is empty. A skeleton here would never be reachable.
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      {illustration && (
        <div className="flex h-16 w-16 items-center justify-center rounded-pill bg-primary-50 text-primary-600">
          {illustration}
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {action &&
        ('href' in action ? (
          <Button asChild className="mt-2">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button className="mt-2" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
