import * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * Restyled onto Gulbahar tokens. Changes from stock shadcn:
 * - rounded-md → rounded-control, bg-transparent → bg-card
 * - h-9 → h-10 to match our default button height
 * - text-start so the caret and placeholder follow the document direction
 *   instead of hard-coding left alignment (PRD §10.3)
 * - Focus ring widened to 2px with an offset to match Button
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'rounded-control border-input bg-card shadow-card file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex h-10 w-full border px-3 py-1 text-start text-base transition-colors duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
