'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * "Print" — the only client code on the owners' monthly report.
 *
 * `window.print()` needs a click handler and therefore a client component, and
 * this is deliberately the whole of it: everything else on that page is server
 * rendered, because the page's value is that it is a document rather than an
 * application. The label arrives already translated, so this file has no
 * `useTranslations` and no string of its own.
 *
 * It is `print:hidden` at the call site rather than here — a control that
 * appears in the printout it produced is the classic tell of a screen someone
 * bolted a print stylesheet onto.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}
