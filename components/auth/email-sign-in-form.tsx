'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signInWithEmailAction } from '@/lib/actions/auth';
import { useRouter } from '@/lib/i18n/navigation';

/**
 * Email + password sign-in (Prompt A1) — the second tab on the sign-in page,
 * next to the phone + OTP flow which stays the primary, always-available one.
 *
 * One form, one submit: unlike the phone flow there is no two-step dance,
 * because there is no code to wait for — the account already proved control
 * of the email when it was verified from Security.
 */
export function EmailSignInForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const result = await signInWithEmailAction(formData);
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }

    toast.success(t('signedIn'));
    const home =
      result.data.role === 'admin'
        ? '/admin'
        : result.data.role === 'shopkeeper'
          ? '/dashboard'
          : '/';
    router.replace(redirectTo === '/' ? home : redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          placeholder="name@example.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t('passwordLabel')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('verifying') : t('signIn')}
      </Button>
    </form>
  );
}
