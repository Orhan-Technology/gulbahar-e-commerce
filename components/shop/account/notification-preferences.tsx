'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { setNotificationPreference } from '@/lib/actions/notifications';
import { MUTABLE_CATEGORIES, type MutableCategory } from '@/lib/notification-links';

/**
 * Which notifications to receive (Prompt C12).
 *
 * The switches control what gets WRITTEN, not what gets shown: a notification
 * somebody asked not to receive should not exist, and one that existed but was
 * hidden would still turn up in the demo log and contradict their bell.
 *
 * ACCOUNT MESSAGES HAVE NO SWITCH. A role change or a security notice is not a
 * preference — it is the platform telling somebody about their own access, and
 * a mute on it would be a way to miss the one that matters.
 *
 * Optimistic, with rollback: a switch that waits for a round trip before moving
 * reads as broken, and nothing downstream depends on the answer arriving before
 * the next render.
 */
export function NotificationPreferences({
  preferences,
}: {
  preferences: Record<string, boolean> | null;
}) {
  const t = useTranslations('notificationCentre.preferences');
  const router = useRouter();

  const [state, setState] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      MUTABLE_CATEGORIES.map((category) => [category, preferences?.[category] !== false]),
    ),
  );
  const [, startTransition] = React.useTransition();

  function toggle(category: string, enabled: boolean) {
    setState((current) => ({ ...current, [category]: enabled }));

    startTransition(async () => {
      const result = await setNotificationPreference({
        category: category as MutableCategory,
        enabled,
      });

      if (!result.ok) {
        setState((current) => ({ ...current, [category]: !enabled }));
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      router.refresh();
    });
  }

  return (
    <ul className="divide-border divide-y" data-notification-preferences>
      {MUTABLE_CATEGORIES.map((category) => (
        <li key={category} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t(`categories.${category}` as never)}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t(`hints.${category}` as never)}
            </p>
          </div>
          <Switch
            checked={state[category] ?? true}
            onCheckedChange={(checked) => toggle(category, checked)}
            aria-label={t(`categories.${category}` as never)}
            data-preference={category}
          />
        </li>
      ))}
    </ul>
  );
}
