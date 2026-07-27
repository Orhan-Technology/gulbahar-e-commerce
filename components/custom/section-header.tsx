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
  className?: string;
}

/**
 * Section title plus optional "view all" affordance, used across the storefront
 * home and listing pages (PRD §5.1).
 *
 * The chevron mirrors in RTL so it always points forward in reading order.
 */
export function SectionHeader({
  title,
  description,
  href,
  actionLabel,
  className,
}: SectionHeaderProps) {
  const t = useTranslations('common');

  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-lg font-bold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {href && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-control text-sm font-medium text-primary transition-colors duration-fast hover:text-primary-800"
        >
          {actionLabel ?? t('viewAll')}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </div>
  );
}

SectionHeader.Skeleton = function SectionHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-5 w-20" />
    </div>
  );
};
