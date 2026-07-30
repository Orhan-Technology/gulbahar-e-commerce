'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Opens the browser's print dialog (Prompt C6).
 *
 * A client component for one line, because `window.print()` cannot be called
 * from a server component — and a `<a href>` to a PDF endpoint would mean
 * generating PDFs on a demo that has no such dependency and no need for one:
 * the browser already renders this page to paper correctly.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}
