'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { markAllMineRead } from '@/lib/actions/notifications';

/** "Mark everything read", on the history page (Prompt C12). */
export function MarkAllReadButton() {
  const t = useTranslations('notificationCentre');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllMineRead();
          router.refresh();
        })
      }
    >
      <CheckCheck />
      {t('markAllRead')}
    </Button>
  );
}
