'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { localeDirection } from '@/lib/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Radix defaults its own `dir` to "ltr" and STAMPS IT ON THE DOM, where it beats
 * the `dir="rtl"` on <html>. Every tabbed screen therefore rendered
 * left-to-right inside a right-to-left console: flex rows reversed, `ms-`/`me-`
 * and `text-start` resolved to the wrong edge, and any Dari sentence containing
 * a number came apart, because the number resolved against an LTR paragraph.
 *
 * It looked like a dozen unrelated "bidi bugs" on cards and headers. It was one
 * attribute, several levels up. Defaulting from the active locale fixes all of
 * them at once, and an explicit `dir` prop still wins for the rare case that
 * genuinely wants the other direction.
 */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ dir, ...props }, ref) => {
  const locale = useLocale();
  return <TabsPrimitive.Root ref={ref} dir={dir ?? localeDirection(locale)} {...props} />;
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
