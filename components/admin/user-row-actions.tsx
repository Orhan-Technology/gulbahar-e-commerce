'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { setUserActive } from '@/lib/actions/admin-catalogue';

/**
 * Deactivate / reactivate an account (PRD §7.5).
 *
 * Deactivation is a sign-in block, not a delete: orders reference their user with ON
 * DELETE RESTRICT so history cannot be erased, and that is deliberate. The dialog
 * says as much, because "deactivate" reads like "remove" otherwise.
 */
export function UserRowActions({
  userId,
  active,
  isSelf,
}: {
  userId: string;
  active: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations('adminUsers');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  // An admin locking themselves out mid-demo would need a database console to fix.
  if (isSelf) return null;

  function run(next: boolean) {
    startTransition(async () => {
      const result = await setUserActive(userId, next);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(next ? 'reactivated' : 'deactivated'));
      setOpen(false);
      router.refresh();
    });
  }

  if (!active) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(true)}>
        <UserCheck />
        {t('reactivate')}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="hover:text-danger text-neutral-600"
      >
        <UserX />
        {t('deactivate')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deactivateTitle')}</DialogTitle>
            <DialogDescription>{t('deactivateBody')}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(false)}>
              {pending ? t('working') : t('confirmDeactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
