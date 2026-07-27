'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { reorder } from '@/lib/actions/account';
import { useRouter } from '@/lib/i18n/navigation';

/**
 * One-tap reorder (PRD §5.4).
 *
 * Reports skipped lines honestly rather than silently dropping them: a customer
 * who reorders four items and gets three needs to know which, not to discover it
 * at checkout.
 */
export function ReorderButton({ reference }: { reference: string }) {
  const t = useTranslations('orders');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reorder(reference);

          if (!result.ok) {
            toast.error(t(`errors.${result.error}` as never));
            return;
          }

          if (result.data.added === 0) {
            toast.error(t('reorderNothingAvailable'));
            return;
          }

          toast.success(
            result.data.skipped > 0
              ? t('reorderPartial', { added: result.data.added, skipped: result.data.skipped })
              : t('reorderDone', { added: result.data.added }),
            { action: { label: t('goToCart'), onClick: () => router.push('/cart') } },
          );
          router.refresh();
        })
      }
    >
      <RotateCcw />
      {pending ? t('reordering') : t('reorder')}
    </Button>
  );
}
