'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { ButtonProps, buttonVariants } from '@/components/ui/button';

/*
 * Restyled from stock shadcn. Two substantive changes (PRD §10.3):
 * - Previous/Next chevrons MIRROR in RTL. In Dari, "previous" points to the
 *   right; stock hard-codes ChevronLeft for previous, which points backwards.
 * - Labels and aria-labels come from translations instead of literal English.
 */

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => {
  const t = useTranslations('pagination');
  return (
    <nav
      role="navigation"
      aria-label={t('label')}
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
};
Pagination.displayName = 'Pagination';

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
  ),
);
PaginationContent.displayName = 'PaginationContent';

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn('', className)} {...props} />,
);
PaginationItem.displayName = 'PaginationItem';

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<ButtonProps, 'size'> &
  React.ComponentProps<'a'>;

const PaginationLink = ({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) => (
  <a
    aria-current={isActive ? 'page' : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? 'outline' : 'ghost',
        size,
      }),
      className,
    )}
    {...props}
  />
);
PaginationLink.displayName = 'PaginationLink';

/**
 * `rtl:rotate-180` mirrors the chevron so it always points away from the
 * current page in reading order, in both directions.
 */
const mirroredChevron = 'h-4 w-4 rtl:rotate-180';

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => {
  const t = useTranslations('pagination');
  return (
    <PaginationLink
      aria-label={t('previousAria')}
      size="default"
      className={cn('gap-1 ps-2.5', className)}
      {...props}
    >
      <ChevronLeft className={mirroredChevron} />
      <span>{t('previous')}</span>
    </PaginationLink>
  );
};
PaginationPrevious.displayName = 'PaginationPrevious';

const PaginationNext = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => {
  const t = useTranslations('pagination');
  return (
    <PaginationLink
      aria-label={t('nextAria')}
      size="default"
      className={cn('gap-1 pe-2.5', className)}
      {...props}
    >
      <span>{t('next')}</span>
      <ChevronRight className={mirroredChevron} />
    </PaginationLink>
  );
};
PaginationNext.displayName = 'PaginationNext';

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => {
  const t = useTranslations('pagination');
  return (
    <span
      aria-hidden
      className={cn('flex h-9 w-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">{t('morePages')}</span>
    </span>
  );
};
PaginationEllipsis.displayName = 'PaginationEllipsis';

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
