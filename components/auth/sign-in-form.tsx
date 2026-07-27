'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { OPEN_LOG_EVENT } from '@/lib/demo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestOtpAction, verifyOtpAction } from '@/lib/actions/auth';
import { useRouter } from '@/lib/i18n/navigation';

/**
 * Two-step phone + OTP sign-in (PRD §5.7).
 *
 * Functional rather than final: Phase 5.4 folds this into checkout as an inline
 * step with the storefront's styling. The code is never sent anywhere — it
 * appears in the notification log panel, which is the moment the presenter points
 * at during the demo (PRD §9.2).
 */
export function SignInForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const t = useTranslations('auth');
  const router = useRouter();

  const [step, setStep] = React.useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function onRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const result = await requestOtpAction(formData);
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }

    setPhone(String(formData.get('phone') ?? ''));
    setStep('code');
    toast.success(t('codeSent'));
  }

  async function onVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const result = await verifyOtpAction(formData);
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }

    toast.success(t('signedIn'));
    router.replace(redirectTo);
    // Ensures server components re-read the new session.
    router.refresh();
  }

  if (step === 'phone') {
    return (
      <form onSubmit={onRequest} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t('phoneLabel')}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="0700000000"
            autoComplete="tel"
            required
          />
          <p className="text-muted-foreground text-xs">{t('phoneHint')}</p>
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('sending') : t('sendCode')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerify} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />

      <div className="space-y-1.5">
        <Label htmlFor="code">{t('codeLabel')}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          /* Persian digits in fa, Latin in en — the placeholder shows the
             SHAPE of the code, so it has to be in the reader's numerals. */
          placeholder={t('codePlaceholder')}
          autoComplete="one-time-code"
          required
        />
        {/*
          The code is never sent anywhere — it renders in the notification log
          (PRD §9.1). That is easy to miss if you are expecting an SMS, so the hint
          is a button that opens the log rather than prose describing where to look.
        */}
        <p className="text-muted-foreground text-xs">
          {t('codeHint')}{' '}
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_LOG_EVENT))}
          >
            {t('openLog')}
          </button>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">{t('nameLabel')}</Label>
        <Input id="name" name="name" placeholder={t('namePlaceholder')} autoComplete="name" />
        <p className="text-muted-foreground text-xs">{t('nameHint')}</p>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('verifying') : t('verify')}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('phone')}>
        {t('changeNumber')}
      </Button>
    </form>
  );
}
