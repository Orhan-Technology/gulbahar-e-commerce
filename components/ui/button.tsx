import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Restyled from the shadcn/ui default onto Gulbahar tokens (PRD §10.4).
 *
 * Changes from stock:
 * - hover:bg-accent → hover:bg-neutral-100. shadcn uses `accent` for subtle
 *   hover backgrounds, but our `accent` is brand gold — stock would turn every
 *   ghost/outline hover gold.
 * - rounded-md → rounded-control; shadow → shadow-card (two-level elevation).
 * - Added an `accent` variant for the rare gold call-to-action.
 * - Focus ring is 2px with an offset, so it stays visible on dark fills.
 * - `pressable` on the base, so every button gives under a press through the
 *   one shared implementation (components/motion/pressable.tsx). The `link`
 *   variant opts out below: a run of text shrinking reads as a rendering
 *   glitch, not as a button being pressed.
 *
 *   `scale` is named in the transition list HERE rather than left to the
 *   .pressable rule, because `transition-colors` is a utility and .pressable is
 *   in the components layer — the utility wins the transition-property outright
 *   and the press would land instantly with no return. One list, one duration,
 *   for the whole control.
 *
 *   `duration-[var(--duration-press)]`, not `duration-press`: `--duration-*` is
 *   NOT one of Tailwind v4's utility-generating namespaces, so the bare form
 *   generates nothing at all and `transition-*` silently falls back to its own
 *   150ms default — a wrong duration with no error anywhere. Same for
 *   --duration-feedback and --duration-decorative: they are reference values
 *   for stylesheets, not class names.
 */
const buttonVariants = cva(
  'pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-[color,background-color,border-color,scale] duration-[var(--duration-press)] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-card hover:bg-primary-800',
        accent: 'bg-accent text-accent-foreground shadow-card hover:bg-accent-700',
        destructive: 'bg-danger text-danger-fg shadow-card hover:bg-danger/90',
        outline: 'border border-input bg-card text-foreground shadow-card hover:bg-neutral-100',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-neutral-200',
        ghost: 'text-foreground hover:bg-neutral-100',
        // A utility, so it outranks the components-layer .pressable rule.
        link: 'text-primary underline-offset-4 hover:underline data-[pressed]:scale-100',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
