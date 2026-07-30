'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { signOutAction } from '@/lib/actions/auth';
import { useRouter } from '@/lib/i18n/navigation';

/**
 * Sign out — quiet, at the bottom, and it asks first (Prompt A2).
 *
 * A ghost button rather than an outlined one: it used to sit beside "Save" in
 * the profile form with equal visual weight, which made leaving as prominent an
 * action as updating your own name. It is the least likely thing anyone came
 * here to do, so it looks like it.
 *
 * The confirm exists because signing out is cheap to trigger and annoying to
 * undo on a phone — the OTP has to be requested and read again — and because
 * this sits directly under the section list a thumb is already scrolling
 * through.
 */
export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations('account');
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={className}
        onClick={() => setConfirming(true)}
      >
        <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
        {t('signOut')}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('signOutConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('signOutConfirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await signOutAction();
                  // Home, not /account: the page they are on requires a session
                  // that no longer exists, so staying would bounce to sign-in
                  // and read as a failure rather than as having signed out.
                  router.replace('/');
                  router.refresh();
                })
              }
            >
              {pending ? t('saving') : t('signOut')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
