'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { resumeShop } from '@/lib/actions/shop-settings';

/**
 * One tap back to trading, from wherever the banner is showing.
 *
 * The LABEL IS A PROP because the same button says two different things: "open
 * now" while the shop is still inside its closure, and "yes, I'm back" once the
 * date has passed and the shop is already trading. Both run the same action —
 * clearing the pause — but they are answers to different questions, and passing
 * the finished string keeps the translation on the server side where the rest of
 * the banner's copy is resolved.
 */
export function ResumeShopButton({ label }: { label: string }) {
  const t = useTranslations('shopSettings.vacation');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resumeShop();
          if (!result.ok) {
            toast.error(t(`errors.${result.error}` as never));
            return;
          }
          toast.success(t('resumed'));
          router.refresh();
        })
      }
    >
      {pending ? t('resuming') : label}
    </Button>
  );
}
