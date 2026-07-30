'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateProfile } from '@/lib/actions/account';
import { useRouter } from '@/lib/i18n/navigation';
import type { AppLocale } from '@/lib/i18n/routing';

/**
 * Language preference (Prompt A2, /account/settings).
 *
 * Saving NAVIGATES into the chosen locale rather than only writing the column,
 * so the setting takes effect on the screen that set it instead of on the next
 * visit. The name travels unchanged because `updateProfile` writes both fields
 * — this form owns one of them and must not blank the other.
 *
 * The options are the PUBLISHED locales, not every locale the app has structure
 * for: Pashto's strings are deferred (PRD §11), and offering it here would be
 * the same lie as offering it in the header switcher.
 */
export function LanguageForm({
  name,
  locale,
  locales,
}: {
  name: string;
  locale: string;
  locales: readonly AppLocale[];
}) {
  const t = useTranslations('account');
  const router = useRouter();
  const [next, setNext] = React.useState(locale);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await updateProfile({ name, locale: next });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      toast.success(t('profileSaved'));
      if (next !== locale) {
        router.replace('/account/settings', { locale: next as AppLocale });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="account-locale">{t('language')}</Label>
        <Select value={next} onValueChange={setNext}>
          <SelectTrigger id="account-locale">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`locales.${value}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{t('settings.languageHint')}</p>
      </div>

      <Button type="submit" size="sm" disabled={pending || next === locale}>
        {pending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
