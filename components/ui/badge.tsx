import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Restyled onto Gulbahar tokens. Pills rather than stock's rounded-md, and the
 * semantic variants use our tinted bg/border/fg triples so a status badge reads
 * as a status rather than a solid block of colour.
 *
 * The `accent` variant is the gold used by SponsoredBadge (PRD §8.4).
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        accent: 'border-accent-200 bg-accent-100 text-accent-900',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-success-border bg-success-bg text-success',
        warning: 'border-warning-border bg-warning-bg text-warning-fg',
        destructive: 'border-danger-border bg-danger-bg text-danger',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
