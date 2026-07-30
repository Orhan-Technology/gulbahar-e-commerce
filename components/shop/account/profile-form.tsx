'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateProfile } from '@/lib/actions/account';
import { signOutAction } from '@/lib/actions/auth';
import { formatPhone } from '@/lib/format';
import { useRouter } from '@/lib/i18n/navigation';
import { routing } from '@/lib/i18n/routing';

/**
 * Profile: name and language preference, plus sign out (PRD §5.4).
 *
 * Saving a new language navigates into that locale, so the preference takes effect
 * immediately rather than only on the next visit.
 */
export function ProfileForm({
  name,
  locale,
  phone,
}: {
  name: string;
  locale: string;
  phone: string;
}) {
  const t = useTranslations('account');
  const uiLocale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [nextLocale, setNextLocale] = React.useState(locale);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateProfile({
        name: String(data.get('name') ?? ''),
        locale: nextLocale,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      toast.success(t('profileSaved'));
      if (nextLocale !== locale) {
        router.replace('/account', { locale: nextLocale as 'fa' | 'en' | 'ps' });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">{t('name')}</Label>
        <Input id="name" name="name" defaultValue={name} required minLength={2} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">{t('phone')}</Label>
        {/* Phone is the identity; changing it would mean changing account. */}
        <Input id="phone" value={formatPhone(phone, uiLocale)} dir="ltr" disabled />
        <p className="text-muted-foreground text-xs">{t('phoneLocked')}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="locale">{t('language')}</Label>
        <Select value={nextLocale} onValueChange={setNextLocale}>
          <SelectTrigger id="locale">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {routing.locales.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`locales.${value}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : t('save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            startTransition(async () => {
              await signOutAction();
              router.replace('/');
              router.refresh();
            })
          }
        >
          {t('signOut')}
        </Button>
      </div>
    </form>
  );
}
