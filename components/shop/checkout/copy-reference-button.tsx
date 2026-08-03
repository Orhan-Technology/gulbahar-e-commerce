'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/**
 * Copy the order reference (finding #7).
 *
 * The confirmation screen's own subtitle instructs the customer to KEEP this
 * number, and then offers no way to keep it: on a phone the only option was to
 * read eight characters off the screen and retype them into wherever they were
 * going. A reference the page tells you to hold on to should be one press away
 * from the clipboard.
 *
 * The tick is a two-second state on the button rather than only a toast,
 * because a toast on a celebratory screen competes with the celebration, and
 * feedback belongs on the control that was pressed.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be refused
 * by permission, so the failure path says so instead of leaving a button that
 * appears to do nothing.
 */
export function CopyReferenceButton({ reference }: { reference: string }) {
  const t = useTranslations('confirmation');
  const [copied, setCopied] = React.useState(false);

  /*
   * The tick clears itself on a timer. setState from inside the timeout, never
   * synchronously in the effect body — React 19's rule — and the timer is
   * cleared on unmount so a customer who navigates away mid-countdown does not
   * leave a setState pointed at a dead component.
   */
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      aria-label={t('copyReference')}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? t('copied') : t('copyReference')}
    </Button>
  );
}
