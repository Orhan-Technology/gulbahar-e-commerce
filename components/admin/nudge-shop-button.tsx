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
 * It sends EVERY FLAG ON THE ROW, not a generic reminder and not the first one.
 * A message saying "please review your shop" is noise a shopkeeper learns to
 * skip; one naming the median hours their customers wait is something they can
 * act on before closing. It used to send `flags[0]`, so a tenant with three
 * problems was told about one and the admin had no way to send the rest — the
 * message was a summary of a list only the sender could see.
 *
 * It STAYS SENT once pressed rather than resetting to its idle label. A mall
 * with two staff will otherwise nudge the same tenant twice in a morning, which
 * is how a helpful message becomes nagging — and the audit log records who
 * sent it, so the second person can see.
 */
export function NudgeShopButton({ shopId, flags }: { shopId: string; flags: HealthFlag[] }) {
  const t = useTranslations('adminShops.health');
  const router = useRouter();

  const [sent, setSent] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function send() {
    startTransition(async () => {
      const result = await nudgeShopAboutHealth({ shopId, flags });
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
      {/* The count is on the button, so the admin can see how much they are
          about to say before they say it. */}
      {sent ? t('nudgeSentShort') : flags.length > 1 ? t('nudgeAll') : t('nudge')}
    </Button>
  );
}
