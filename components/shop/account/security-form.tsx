'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, KeyRound, Mail } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  requestEmailVerificationAction,
  requestPasswordChangeOtpAction,
  setPasswordAction,
  verifyEmailCodeAction,
} from '@/lib/actions/account';
import { formatDate } from '@/lib/format';
import { useRouter } from '@/lib/i18n/navigation';

/**
 * Email + password as a SECOND way in (Prompt A1) — never a second identity.
 * Lives on /account for now; A2 relocates it into its own Security route
 * without changing anything below the surface.
 *
 * Two independent sub-forms, each its own small state machine rather than one
 * shared "editing" flag: verifying an email and changing a password are
 * unrelated tasks, and a shopkeeper who opens one should not have the other
 * jump into an editing state too.
 */
export function SecurityForm({
  locale,
  email,
  emailVerifiedAt,
  hasPassword,
  passwordUpdatedAt,
}: {
  locale: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  hasPassword: boolean;
  passwordUpdatedAt: Date | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-5">
      <EmailSection email={emailVerifiedAt ? email : null} onVerified={() => router.refresh()} />
      <div className="border-border border-t" />
      <PasswordSection
        hasPassword={hasPassword}
        passwordUpdatedAt={passwordUpdatedAt}
        locale={locale}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function EmailSection({
  email,
  onVerified,
}: {
  email: string | null;
  onVerified: () => void;
}) {
  const t = useTranslations('account');
  const [step, setStep] = React.useState<'idle' | 'entering-email' | 'entering-code'>('idle');
  const [pendingEmail, setPendingEmail] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function onRequestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = String(formData.get('email') ?? '').trim();

    setPending(true);
    const result = await requestEmailVerificationAction(value);
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }

    setPendingEmail(value);
    setStep('entering-code');
    toast.success(t('security.codeSent'));
  }

  async function onVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get('code') ?? '');

    setPending(true);
    const result = await verifyEmailCodeAction(code);
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }

    toast.success(t('security.emailVerifiedToast'));
    setStep('idle');
    onVerified();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Mail className="text-muted-foreground h-4 w-4" aria-hidden />
          {t('security.emailLabel')}
        </span>
        {email && (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" aria-hidden />
            {t('security.emailVerified')}
          </Badge>
        )}
      </div>

      {email && step === 'idle' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm" dir="ltr">
            {email}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep('entering-email')}
          >
            {t('security.changeEmail')}
          </Button>
        </div>
      )}

      {!email && step === 'idle' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">{t('security.emailNotSet')}</span>
          <Button type="button" size="sm" onClick={() => setStep('entering-email')}>
            {t('security.addEmail')}
          </Button>
        </div>
      )}

      {step === 'entering-email' && (
        <form onSubmit={onRequestCode} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="email" className="sr-only">
              {t('security.emailLabel')}
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              placeholder={t('security.emailPlaceholder')}
              defaultValue={email ?? ''}
              autoComplete="email"
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t('security.sending') : t('security.sendCode')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep('idle')}>
            {t('security.cancel')}
          </Button>
        </form>
      )}

      {step === 'entering-code' && (
        <form onSubmit={onVerifyCode} className="space-y-2">
          <p className="text-muted-foreground text-xs" dir="ltr">
            {pendingEmail}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="email-code" className="sr-only">
                {t('security.codeLabel')}
              </Label>
              <Input
                id="email-code"
                name="code"
                inputMode="numeric"
                dir="ltr"
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t('security.verifying') : t('security.verifyEmail')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep('idle')}>
              {t('security.cancel')}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t('security.codeHint')}</p>
        </form>
      )}
    </div>
  );
}

function PasswordSection({
  hasPassword,
  passwordUpdatedAt,
  locale,
  onSaved,
}: {
  hasPassword: boolean;
  passwordUpdatedAt: Date | null;
  locale: string;
  onSaved: () => void;
}) {
  const t = useTranslations('account');
  const [editing, setEditing] = React.useState(false);
  const [reauthMethod, setReauthMethod] = React.useState<'password' | 'otp'>('password');
  const [otpRequested, setOtpRequested] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onRequestOtp() {
    setPending(true);
    const result = await requestPasswordChangeOtpAction();
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }
    setOtpRequested(true);
    toast.success(t('security.otpSent'));
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setPending(true);
    const result = await setPasswordAction({
      newPassword: String(formData.get('newPassword') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
      currentPassword:
        hasPassword && reauthMethod === 'password'
          ? String(formData.get('currentPassword') ?? '')
          : undefined,
      otpCode: hasPassword && reauthMethod === 'otp' ? String(formData.get('otpCode') ?? '') : undefined,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(t(`errors.${result.error}` as never));
      return;
    }

    toast.success(t('security.passwordSavedToast'));
    setEditing(false);
    setOtpRequested(false);
    onSaved();
  }

  return (
    <div className="space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="text-muted-foreground h-4 w-4" aria-hidden />
        {t('security.passwordLabel')}
      </span>

      {!editing && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            {hasPassword && passwordUpdatedAt
              ? t('security.passwordUpdatedOn', { date: formatDate(passwordUpdatedAt, locale) })
              : t('security.passwordNotSet')}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            {hasPassword ? t('security.changePassword') : t('security.setPassword')}
          </Button>
        </div>
      )}

      {editing && (
        <form onSubmit={onSave} className="space-y-3">
          {hasPassword && (
            <div className="space-y-2">
              {reauthMethod === 'password' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">{t('security.currentPasswordLabel')}</Label>
                  <Input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    dir="ltr"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="text-primary text-xs underline underline-offset-2"
                    onClick={() => setReauthMethod('otp')}
                  >
                    {t('security.useOtpInstead')}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="otpCode">{t('security.otpLabel')}</Label>
                  {!otpRequested ? (
                    <Button type="button" size="sm" variant="outline" onClick={onRequestOtp} disabled={pending}>
                      {t('security.requestOtp')}
                    </Button>
                  ) : (
                    <Input
                      id="otpCode"
                      name="otpCode"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={6}
                      autoComplete="one-time-code"
                      required
                    />
                  )}
                  <button
                    type="button"
                    className="text-primary block text-xs underline underline-offset-2"
                    onClick={() => setReauthMethod('password')}
                  >
                    {t('security.useCurrentPasswordInstead')}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">{t('security.newPasswordLabel')}</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              dir="ltr"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">{t('security.confirmPasswordLabel')}</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              dir="ltr"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {t('security.save')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setOtpRequested(false);
                setReauthMethod('password');
              }}
            >
              {t('security.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
