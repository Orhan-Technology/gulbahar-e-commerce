'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BellRing, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { nudgeShopAboutHealth } from '@/lib/actions/admin-catalogue';
import type { HealthFlag } from '@/lib/db/queries/mall';

/**
 * "Nudge shop", from the health row (Prompt C9).
 *
 * It sends the SHOP'S WORST FLAG, not a generic reminder. A message saying
 * "please review your shop" is noise a shopkeeper learns to skip; one naming
 * the median hours their customers wait is something they can act on before
 * closing.
 *
 * It STAYS SENT once pressed rather than resetting to its idle label. A mall
 * with two staff will otherwise nudge the same tenant twice in a morning, which
 * is how a helpful message becomes nagging — and the audit log records who
 * sent it, so the second person can see.
 */
export function NudgeShopButton({ shopId, flag }: { shopId: string; flag: HealthFlag }) {
  const t = useTranslations('adminShops.health');
  const router = useRouter();

  const [sent, setSent] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function send() {
    startTransition(async () => {
      const result = await nudgeShopAboutHealth({ shopId, flag });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      setSent(true);
      toast.success(t('nudgeSent'));
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending || sent}
      onClick={send}
      className="shrink-0"
    >
      {sent ? <Check /> : <BellRing />}
      {sent ? t('nudgeSentShort') : t('nudge')}
    </Button>
  );
}
