'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { OPEN_LOG_EVENT } from '@/lib/demo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestOtpAction, verifyOtpAction } from '@/lib/actions/auth';
import { formatNumber } from '@/lib/format';
import { useRouter } from '@/lib/i18n/navigation';

/**
 * How long the resend control stays closed after a code goes out.
 *
 * Short enough that somebody who genuinely did not get one is not stuck
 * staring at a dead button, long enough that impatience alone does not burn
 * through the five-per-fifteen-minutes budget in lib/auth/otp.ts — each
 * request supersedes the previous code, so a customer who taps resend three
 * times while reading the first one has invalidated the number they are
 * typing.
 */
const RESEND_SECONDS = 30;

/**
 * And after the rate limiter says no. Its window is fifteen minutes, so a
 * thirty-second retry would just hit the same wall; a minute at least makes the
 * refusal feel like a wait rather than a broken button.
 */
const RATE_LIMITED_SECONDS = 60;

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
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = React.useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = React.useState('');
  const [pending, setPending] = React.useState(false);
  /** How long the issued code lasts, as reported by the action that issued it. */
  const [lifetimeMinutes, setLifetimeMinutes] = React.useState(5);
  /** A returning customer already has a name; asking again reads as amnesia. */
  const [hasName, setHasName] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  /*
   * The resend countdown.
   *
   * setState inside a TIMER inside the effect, never synchronously in the
   * effect body — React 19's lint rule forbids the latter, and the clock is
   * read by the browser's own scheduler rather than by Date.now() during
   * render.
   */
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** One path for the first code and for every resend, so they cannot drift. */
  async function issueCode(forPhone: string): Promise<boolean> {
    const formData = new FormData();
    formData.set('phone', forPhone);

    setPending(true);
    const result = await requestOtpAction(formData);
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      // A refusal from the rate limiter is not a reason to leave the button
      // live: pressing it again would refuse again, which reads as broken.
      if (result.error === 'too_many_requests') setCooldown(RATE_LIMITED_SECONDS);
      return false;
    }

    setLifetimeMinutes(result.data.lifetimeMinutes);
    setHasName(result.data.hasName);
    setCooldown(RESEND_SECONDS);
    toast.success(t('codeSent'));
    return true;
  }

  async function onRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const entered = String(formData.get('phone') ?? '');

    if (!(await issueCode(entered))) return;

    setPhone(entered);
    setStep('code');
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
    /*
     * Land each role on its own surface (QA fix): an admin signing in from the
     * generic sign-in page goes to /admin, a shopkeeper to /dashboard. An
     * explicit ?next= destination (e.g. checkout) still wins — someone mid-
     * purchase should return to their basket, whatever their role.
     */
    const home =
      result.data.role === 'admin'
        ? '/admin'
        : result.data.role === 'shopkeeper'
          ? '/dashboard'
          : '/';
    router.replace(redirectTo === '/' ? home : redirectTo);
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
            /*
              EDITING THE NUMBER CLEARS THE WAIT. The limiter's bucket is keyed
              by phone (lib/auth/otp.ts), so a different number is a different
              budget and must not inherit this one's refusal — otherwise a
              customer who mistyped their own number is locked out of their
              real one for a minute.
            */
            onChange={() => setCooldown(0)}
          />
          <p className="text-muted-foreground text-xs">{t('phoneHint')}</p>
        </div>
        {/*
          THE REFUSAL, AS A WAIT RATHER THAN A TOAST THAT LEAVES.

          `too_many_requests` on this step used to surface only as a toast: four
          seconds later the screen was identical to a working one, and the only
          way to learn the button was still going to be refused was to press it
          again. The countdown is the same one the resend control uses — the
          cooldown state was already being set here, it simply had nothing on
          this step reading it.
        */}
        <Button type="submit" className="w-full" disabled={pending || cooldown > 0}>
          {/* `resendIn`, the resend control's own countdown, rather than a
              string of its own: the reader has just pressed send, so «ارسال
              دوباره تا … ثانیه دیگر» is the same sentence in the same words,
              and one string cannot drift from the other. */}
          {cooldown > 0
            ? t('resendIn', { seconds: formatNumber(cooldown, locale) })
            : pending
              ? t('sending')
              : t('sendCode')}
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
          HOW LONG IT LASTS, stated where the code is typed. Until now the only
          way to learn the code expires was to be told it had — a failure toast
          after typing six digits, which is the worst moment to discover a rule.
        */}
        <p className="text-muted-foreground text-xs">
          {t('codeLifetime', { minutes: formatNumber(lifetimeMinutes, locale) })}
        </p>

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

        {/*
          RESEND — the way out of every failure this step can produce. The
          `too_many_attempts` error literally instructs «کد جدید بگیرید» and
          there was nothing on the screen that did it, so the only recovery was
          to go back a step and retype the number.

          Disabled with a visible countdown rather than hidden: a control that
          appears out of nowhere after thirty seconds cannot be waited for,
          because nobody knows it is coming.
        */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-primary -ms-2"
          disabled={pending || cooldown > 0}
          onClick={() => void issueCode(phone)}
        >
          <RotateCw aria-hidden />
          {cooldown > 0
            ? t('resendIn', { seconds: formatNumber(cooldown, locale) })
            : t('resendCode')}
        </Button>
      </div>

      {/*
        ASKED ONLY OF SOMEONE WE DO NOT KNOW. A returning customer typing their
        name into a signed-in shop every time reads as an account that forgot
        them — and the field was decorative for them anyway, since verifyOtp
        only reads it when it CREATES the user row.
      */}
      {!hasName && (
        <div className="space-y-1.5">
          <Label htmlFor="name">{t('nameLabel')}</Label>
          <Input id="name" name="name" placeholder={t('namePlaceholder')} autoComplete="name" />
          <p className="text-muted-foreground text-xs">{t('nameHint')}</p>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('verifying') : t('verify')}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('phone')}>
        {t('changeNumber')}
      </Button>
    </form>
  );
}
