import type * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  /** When set, renders the "view all" link with a direction-mirrored chevron. */
  href?: string;
  /** Overrides the default "view all" label. */
  actionLabel?: string;
  /**
   * Rendered immediately after the title, before the "view all" link — the
   * flash-sale countdown pill and the sponsored marker both live here.
   */
  adornment?: React.ReactNode;
  className?: string;
}

/**
 * Section title plus optional "view all" affordance, used across the storefront
 * home and listing pages (PRD §5.1).
 *
 * Title and adornment sit together at the inline start with the link pushed to
 * the far end by a spacer, exactly as the mockup's band headings do. The chevron
 * mirrors in RTL so it always points forward in reading order.
 */
export function SectionHeader({
  title,
  description,
  href,
  actionLabel,
  adornment,
  className,
}: SectionHeaderProps) {
  const t = useTranslations('common');

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-foreground truncate text-2xl font-bold">{title}</h2>
        {description && (
          <p className="text-muted-foreground mt-1 truncate text-sm">{description}</p>
        )}
      </div>

      {adornment}

      {href && (
        <Link
          href={href}
          className="rounded-control text-primary hover:text-primary-800 ms-auto inline-flex shrink-0 items-center gap-1 text-sm font-semibold transition-colors duration-150"
        >
          {actionLabel ?? t('viewAll')}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function SectionHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Skeleton className="h-8 w-52" />
      <Skeleton className="ms-auto h-5 w-20" />
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and SectionHeader.Skeleton reads as undefined. Server code
 * must import SectionHeaderSkeleton directly.
 */
SectionHeader.Skeleton = SectionHeaderSkeleton;
