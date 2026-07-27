'use client';

import { useLocale } from 'next-intl';
import { Toaster as Sonner } from 'sonner';

import { localeDirection } from '@/lib/i18n/routing';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/*
 * Restyled from stock shadcn. Changes:
 * - next-themes removed. The MVP is light mode only (PRD §16), so a theme
 *   provider would be dead weight and an extra dependency.
 * - Position swaps with document direction: bottom-end in both languages, which
 *   is bottom-left in Dari and bottom-right in English. Stock pins bottom-right,
 *   which in RTL lands on the wrong side of the screen (PRD §10.3).
 * - Surfaces and shadow use our tokens.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const locale = useLocale();
  const dir = localeDirection(locale);

  return (
    <Sonner
      theme="light"
      dir={dir}
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-overlay group-[.toaster]:rounded-card',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
